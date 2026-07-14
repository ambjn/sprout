import { MAX_BATCH_SIZE as SERVER_MAX_BATCH_SIZE } from "../component/constants.js";
import type {
  PropertyValue,
  QueueStorage,
  SproutContext,
  SproutCoreOptions,
  SproutEvent,
  SproutEventType,
} from "./types.js";

const QUEUE_KEY = "sprout:queue:v1";
const DEVICE_ID_KEY = "sprout:deviceId";
const USER_ID_KEY = "sprout:userId";

const PERSIST_DEBOUNCE_MS = 500;

const DEFAULTS = {
  flushIntervalMs: 10_000,
  maxBatchSize: 50,
  maxQueueSize: 500,
  sessionTimeoutMs: 30 * 60_000,
  breadcrumbLimit: 20,
};

function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

type Breadcrumb = { t: SproutEventType; n: string; at: number };

type SendResult = { ok: boolean; status: number };

/**
 * Framework-agnostic SDK core. Storage, fetch, and clock are injected so the
 * whole thing is unit-testable; the Expo entry point (`index.ts`) wires in
 * AsyncStorage, AppState, ErrorUtils, and device context.
 *
 * Durability: queue persistence is debounced (immediate for errors, on
 * background, and after every successful flush), so events survive an app
 * kill and send on next launch. Every event carries a client-generated id;
 * a batch is sent under its first event's id, which the server uses to
 * dedup retries whose original response was lost.
 */
export class SproutCore {
  private queue: SproutEvent[] = [];
  private breadcrumbs: Breadcrumb[] = [];
  private deviceId = "";
  private sessionId = uuid();
  private sessionStartedAt = 0;
  private lastBackgroundAt: number | null = null;
  private userId: string | undefined;
  private flushing = false;
  private consecutiveFailures = 0;
  private nextFlushAllowedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private initialized = false;

  private readonly storage: QueueStorage;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly opts: Required<
    Pick<
      SproutCoreOptions,
      | "flushIntervalMs"
      | "maxBatchSize"
      | "maxQueueSize"
      | "sessionTimeoutMs"
      | "breadcrumbLimit"
    >
  > &
    SproutCoreOptions;

  constructor(options: SproutCoreOptions) {
    // Drop keys whose value is undefined so they can't clobber DEFAULTS
    // (callers routinely spread through optional config).
    const provided = Object.fromEntries(
      Object.entries(options).filter(([, value]) => value !== undefined),
    ) as unknown as SproutCoreOptions;
    this.opts = { ...DEFAULTS, ...provided };
    // Batches above the server's cap are rejected wholesale (HTTP 400).
    this.opts.maxBatchSize = Math.min(
      this.opts.maxBatchSize,
      SERVER_MAX_BATCH_SIZE,
    );
    this.storage = this.opts.storage;
    // Wrap rather than reference: an unbound `fetch` throws in browsers.
    // (Cast: Bun's fetch type carries an extra `preconnect` static.)
    this.fetchFn =
      this.opts.fetchFn ??
      (((input, init) => fetch(input, init)) as typeof fetch);
    this.now = this.opts.now ?? Date.now;
  }

  /** Load persisted state, start a session, start the flush timer. */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const storedId = await this.storage.getItem(DEVICE_ID_KEY);
      if (storedId) {
        this.deviceId = storedId;
      } else {
        this.deviceId = uuid();
        await this.storage.setItem(DEVICE_ID_KEY, this.deviceId);
      }
      const storedUserId = await this.storage.getItem(USER_ID_KEY);
      if (storedUserId && !this.userId) this.userId = storedUserId;
      const rawQueue = await this.storage.getItem(QUEUE_KEY);
      if (rawQueue) {
        const parsed = JSON.parse(rawQueue) as { v: number; q: SproutEvent[] };
        if (parsed.v === 1 && Array.isArray(parsed.q)) {
          // Backfill ids for queues persisted before events carried them.
          const persisted = parsed.q.map((e) =>
            e.id ? e : { ...e, id: uuid() },
          );
          // Events tracked while init was loading go after the backlog.
          this.queue = [...persisted, ...this.queue];
        }
      }
    } catch (error) {
      this.opts.onInternalError?.(error);
      if (!this.deviceId) this.deviceId = uuid();
    }

    this.sessionStartedAt = this.now();
    await this.enqueue("session_start", "session_start");

    this.timer = setInterval(() => {
      void this.flush();
    }, this.opts.flushIntervalMs);
  }

  shutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    void this.persistNow();
  }

  getSessionId(): string {
    return this.sessionId;
  }
  getDeviceId(): string {
    return this.deviceId;
  }
  getQueueLength(): number {
    return this.queue.length;
  }

  track(
    name: string,
    properties?: Record<string, PropertyValue>,
  ): Promise<void> {
    return this.enqueue("track", name, { properties });
  }

  screen(name: string, properties?: Record<string, PropertyValue>): Promise<void> {
    return this.enqueue("screen", name, { properties });
  }

  identify(
    userId: string,
    traits?: Record<string, PropertyValue>,
  ): Promise<void> {
    this.userId = userId;
    // Persist so the identity survives an app restart.
    void Promise.resolve()
      .then(() => this.storage.setItem(USER_ID_KEY, userId))
      .catch((error) => this.opts.onInternalError?.(error));
    return this.enqueue("identify", "identify", { properties: traits });
  }

  async captureException(
    error: unknown,
    extra?: { properties?: Record<string, PropertyValue>; fatal?: boolean },
  ): Promise<void> {
    const normalized =
      error instanceof Error
        ? { type: error.name || "Error", message: error.message, stack: error.stack }
        : { type: "Error", message: String(error) };
    const properties: Record<string, PropertyValue> = {
      ...extra?.properties,
    };
    if (extra?.fatal !== undefined) properties.fatal = extra.fatal;
    await this.enqueue("error", normalized.type ?? "Error", {
      error: normalized,
      breadcrumbs: JSON.stringify(this.breadcrumbs),
      properties: Object.keys(properties).length ? properties : undefined,
    });
    // Errors flush eagerly -- the app may be about to die -- and bypass any
    // backoff window from earlier failures.
    await this.flush({ force: true });
  }

  /**
   * Wire to AppState. Backgrounding persists and flushes; foregrounding after
   * more than sessionTimeoutMs closes the old session and starts a new one (a
   * brief background hop keeps the session alive).
   */
  async handleAppStateChange(state: string): Promise<void> {
    if (state === "background" || state === "inactive") {
      this.lastBackgroundAt = this.now();
      await this.persistNow();
      await this.flush();
      return;
    }
    if (state === "active" && this.lastBackgroundAt !== null) {
      const gap = this.now() - this.lastBackgroundAt;
      if (gap > this.opts.sessionTimeoutMs) {
        const endedAt = this.lastBackgroundAt;
        await this.enqueue("session_end", "session_end", {
          occurredAt: endedAt,
          properties: { durationMs: endedAt - this.sessionStartedAt },
        });
        this.sessionId = uuid();
        this.sessionStartedAt = this.now();
        this.breadcrumbs = [];
        await this.enqueue("session_start", "session_start");
      }
      this.lastBackgroundAt = null;
    }
  }

  /**
   * Send queued events in batches. Safe to call at any time. `force`
   * bypasses the failure backoff window (used for fatal errors).
   */
  async flush(options?: { force?: boolean }): Promise<void> {
    if (this.flushing) return;
    if (!options?.force && this.now() < this.nextFlushAllowedAt) return;
    this.flushing = true;
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.slice(0, this.opts.maxBatchSize);
        const response = await this.send(batch, batch[0].id);
        if (response === null) {
          // Network failure (offline). Keep everything, back off.
          this.registerFailure();
          return;
        }
        if (response.ok) {
          this.queue.splice(0, batch.length);
          this.consecutiveFailures = 0;
          this.nextFlushAllowedAt = 0;
          await this.persistNow();
        } else if (response.status === 401) {
          // Bad credentials -- drop rather than retry forever.
          this.queue.splice(0, batch.length);
          await this.persistNow();
          this.opts.onInternalError?.(
            new Error("Sprout ingest rejected batch (HTTP 401)"),
          );
        } else if (response.status === 400) {
          // Poison batch: retry per event so one bad event doesn't take the
          // rest of the batch down with it.
          const finished = await this.drainPoisonBatch(batch.length);
          if (!finished) return;
        } else {
          this.registerFailure();
          return;
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private async send(
    events: SproutEvent[],
    batchId: string,
  ): Promise<SendResult | null> {
    try {
      return await this.fetchFn(this.opts.ingestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          writeKey: this.opts.writeKey,
          batchId,
          events,
        }),
      });
    } catch (error) {
      this.opts.onInternalError?.(error);
      return null;
    }
  }

  /**
   * A batch the server rejected with 400 is re-sent one event at a time
   * (batchId = the event's own id, so retries still dedup). Good events
   * deliver; the poison ones drop with an onInternalError report. Returns
   * false if interrupted by a network/server failure.
   */
  private async drainPoisonBatch(count: number): Promise<boolean> {
    for (let i = 0; i < count; i++) {
      // Events are only ever removed from the front, so queue[0] is the next
      // event of the rejected batch on each iteration.
      const event = this.queue[0];
      if (!event) break;
      const response = await this.send([event], event.id);
      if (response === null) {
        this.registerFailure();
        await this.persistNow();
        return false;
      }
      if (response.ok || response.status === 400 || response.status === 401) {
        this.queue.splice(0, 1);
        if (response.ok) {
          this.consecutiveFailures = 0;
          this.nextFlushAllowedAt = 0;
        } else {
          this.opts.onInternalError?.(
            new Error(
              `Sprout ingest rejected event "${event.name}" (HTTP ${response.status})`,
            ),
          );
        }
      } else {
        this.registerFailure();
        await this.persistNow();
        return false;
      }
    }
    await this.persistNow();
    return true;
  }

  private registerFailure(): void {
    this.consecutiveFailures += 1;
    const backoff = Math.min(
      5_000 * 2 ** (this.consecutiveFailures - 1),
      300_000,
    );
    this.nextFlushAllowedAt = this.now() + backoff;
  }

  private async enqueue(
    type: SproutEventType,
    name: string,
    extra?: {
      properties?: Record<string, PropertyValue>;
      error?: { type?: string; message: string; stack?: string };
      breadcrumbs?: string;
      occurredAt?: number;
    },
  ): Promise<void> {
    const event: SproutEvent = {
      id: uuid(),
      type,
      name,
      occurredAt: extra?.occurredAt ?? this.now(),
      sessionId: this.sessionId,
      deviceId: this.deviceId,
      properties: extra?.properties,
      userId: this.userId,
      breadcrumbs: extra?.breadcrumbs,
      error: extra?.error,
      context: this.safeContext(),
    };

    if (type !== "error") {
      this.breadcrumbs.push({ t: type, n: name, at: event.occurredAt });
      if (this.breadcrumbs.length > this.opts.breadcrumbLimit) {
        this.breadcrumbs.shift();
      }
    }

    this.queue.push(event);
    if (this.queue.length > this.opts.maxQueueSize) {
      this.queue.splice(0, this.queue.length - this.opts.maxQueueSize);
    }
    // Errors persist immediately (the app may be crashing); everything else
    // debounces so a burst of events costs one storage write, not N.
    if (type === "error") {
      await this.persistNow();
    } else {
      this.schedulePersist();
    }
  }

  private safeContext(): SproutContext | undefined {
    try {
      return this.opts.getContext?.();
    } catch {
      return undefined;
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistNow();
    }, PERSIST_DEBOUNCE_MS);
  }

  private async persistNow(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    try {
      await this.storage.setItem(
        QUEUE_KEY,
        JSON.stringify({ v: 1, q: this.queue }),
      );
    } catch (error) {
      this.opts.onInternalError?.(error);
    }
  }
}
