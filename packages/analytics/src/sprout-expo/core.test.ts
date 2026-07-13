import { describe, expect, test } from "bun:test";
import { SproutCore } from "./core";
import type { QueueStorage, SproutEvent } from "./types";

function fakeStorage(): QueueStorage & { dump: () => Map<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => {
      map.set(k, v);
    },
    dump: () => map,
  };
}

type SentBatch = { writeKey: string; events: SproutEvent[] };

function fakeFetch(behavior: { fail?: boolean; status?: number } = {}) {
  const sent: SentBatch[] = [];
  const fn = async (_url: string, init: any) => {
    if (behavior.fail) throw new Error("network down");
    const body = JSON.parse(init.body) as SentBatch;
    const status = behavior.status ?? 200;
    if (status === 200) sent.push(body);
    return { ok: status === 200, status } as Response;
  };
  return { fn: fn as unknown as typeof fetch, sent, behavior };
}

function makeCore(overrides: Partial<ConstructorParameters<typeof SproutCore>[0]> = {}) {
  const storage = fakeStorage();
  const fetcher = fakeFetch();
  let currentTime = 1_700_000_000_000;
  const clock = {
    now: () => currentTime,
    advance: (ms: number) => {
      currentTime += ms;
    },
  };
  const core = new SproutCore({
    ingestUrl: "https://example.convex.site/sprout/ingest",
    writeKey: "sk_test",
    storage,
    fetchFn: fetcher.fn,
    now: clock.now,
    ...overrides,
  });
  return { core, storage, fetcher, clock };
}

describe("queueing and flushing", () => {
  test("events batch into one request and clear the queue", async () => {
    const { core, fetcher } = makeCore();
    await core.init();
    await core.track("grov_created", { prompt_length: 42 });
    await core.screen("/home");
    await core.flush();

    expect(fetcher.sent).toHaveLength(1);
    const { writeKey, events } = fetcher.sent[0];
    expect(writeKey).toBe("sk_test");
    // session_start (from init) + track + screen
    expect(events.map((e) => e.type)).toEqual(["session_start", "track", "screen"]);
    expect(events[1].properties).toEqual({ prompt_length: 42 });
    expect(core.getQueueLength()).toBe(0);
    core.shutdown();
  });

  test("large queues drain in multiple batches", async () => {
    const { core, fetcher } = makeCore({ maxBatchSize: 10 });
    await core.init();
    for (let i = 0; i < 25; i++) await core.track(`event_${i}`);
    await core.flush();
    // 26 events (session_start + 25) in batches of 10 => 3 requests
    expect(fetcher.sent).toHaveLength(3);
    expect(core.getQueueLength()).toBe(0);
    core.shutdown();
  });

  test("queue caps at maxQueueSize, dropping oldest", async () => {
    const { core } = makeCore({ maxQueueSize: 5 });
    await core.init();
    for (let i = 0; i < 10; i++) await core.track(`event_${i}`);
    expect(core.getQueueLength()).toBe(5);
    core.shutdown();
  });
});

describe("option handling", () => {
  test("explicit undefined options fall back to defaults instead of clobbering them", async () => {
    // initSprout spreads optional config through, so every key arrives
    // present-but-undefined when the user relies on defaults.
    const { core, fetcher, clock } = makeCore({
      flushIntervalMs: undefined,
      maxBatchSize: undefined,
      maxQueueSize: undefined,
      sessionTimeoutMs: undefined,
    });
    await core.init();
    for (let i = 0; i < 60; i++) await core.track(`event_${i}`);
    await core.flush();
    // 61 events with the default maxBatchSize of 50 => 2 requests.
    expect(fetcher.sent).toHaveLength(2);

    // Default 30min session timeout still applies.
    const firstSession = core.getSessionId();
    await core.handleAppStateChange("background");
    clock.advance(31 * 60_000);
    await core.handleAppStateChange("active");
    expect(core.getSessionId()).not.toBe(firstSession);
    core.shutdown();
  });

  test("maxBatchSize is clamped to the server's 100-event cap", async () => {
    const { core, fetcher } = makeCore({ maxBatchSize: 250 });
    await core.init();
    for (let i = 0; i < 120; i++) await core.track(`event_${i}`);
    await core.flush();
    // 121 events => 100 + 21, never a batch the server would reject.
    expect(fetcher.sent).toHaveLength(2);
    expect(fetcher.sent[0].events).toHaveLength(100);
    core.shutdown();
  });
});

describe("offline durability", () => {
  test("network failure keeps events; backoff gates retry; recovery drains", async () => {
    const { core, fetcher, clock } = makeCore();
    fetcher.behavior.fail = true;
    await core.init();
    await core.track("important_event");
    await core.flush();
    expect(core.getQueueLength()).toBe(2); // nothing lost

    // Immediately retrying is a no-op (backoff window).
    fetcher.behavior.fail = false;
    await core.flush();
    expect(fetcher.sent).toHaveLength(0);

    // After backoff elapses, flush succeeds.
    clock.advance(6_000);
    await core.flush();
    expect(fetcher.sent).toHaveLength(1);
    expect(core.getQueueLength()).toBe(0);
    core.shutdown();
  });

  test("queue survives an app restart (new core, same storage)", async () => {
    const { core, storage, fetcher } = makeCore();
    fetcher.behavior.fail = true;
    await core.init();
    await core.track("queued_before_kill");
    core.shutdown();

    // "Restart": fresh core on the same storage, working network.
    const fetcher2 = fakeFetch();
    const core2 = new SproutCore({
      ingestUrl: "https://example.convex.site/sprout/ingest",
      writeKey: "sk_test",
      storage,
      fetchFn: fetcher2.fn,
    });
    await core2.init();
    await core2.flush();

    const types = fetcher2.sent[0].events.map((e) => e.type);
    expect(types).toContain("track"); // pre-kill event delivered
    // Same device across restarts, different session.
    expect(core2.getDeviceId()).toBe(core.getDeviceId());
    expect(core2.getSessionId()).not.toBe(core.getSessionId());
    core2.shutdown();
  });

  test("a retried batch reuses the same batchId for server-side dedup", async () => {
    const bodies: { batchId: string }[] = [];
    let failFirst = true;
    const fetchFn = (async (_url: string, init: any) => {
      bodies.push(JSON.parse(init.body));
      if (failFirst) {
        failFirst = false;
        throw new Error("network down");
      }
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;

    const { core, clock } = makeCore({ fetchFn });
    await core.init();
    await core.track("event");
    await core.flush(); // fails
    clock.advance(6_000); // past backoff
    await core.flush(); // succeeds

    expect(bodies).toHaveLength(2);
    expect(bodies[0].batchId).toBeTruthy();
    expect(bodies[1].batchId).toBe(bodies[0].batchId);
    core.shutdown();
  });

  test("a poison event is dropped alone; the rest of the batch delivers", async () => {
    const errors: unknown[] = [];
    const delivered: SproutEvent[] = [];
    const fetchFn = (async (_url: string, init: any) => {
      const body = JSON.parse(init.body) as { events: SproutEvent[] };
      if (body.events.some((e) => e.name === "poison")) {
        return { ok: false, status: 400 } as Response;
      }
      delivered.push(...body.events);
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;

    const { core } = makeCore({
      fetchFn,
      onInternalError: (e) => errors.push(e),
    });
    await core.init();
    await core.track("good_one");
    await core.track("poison");
    await core.track("good_two");
    await core.flush();

    expect(core.getQueueLength()).toBe(0);
    expect(delivered.map((e) => e.name)).toEqual([
      "session_start",
      "good_one",
      "good_two",
    ]);
    expect(String(errors[0])).toContain("poison");
    core.shutdown();
  });

  test("identified user persists across restarts", async () => {
    const { core, storage } = makeCore();
    await core.init();
    await core.identify("user-42");
    core.shutdown();

    const fetcher2 = fakeFetch();
    const core2 = new SproutCore({
      ingestUrl: "https://example.convex.site/sprout/ingest",
      writeKey: "sk_test",
      storage,
      fetchFn: fetcher2.fn,
    });
    await core2.init();
    await core2.track("after_restart");
    await core2.flush();

    const event = fetcher2.sent
      .flatMap((b) => b.events)
      .find((e) => e.name === "after_restart")!;
    expect(event.userId).toBe("user-42");
    core2.shutdown();
  });

  test("401 drops the batch instead of retrying forever", async () => {
    const errors: unknown[] = [];
    const { core, fetcher } = makeCore({
      onInternalError: (e) => errors.push(e),
    });
    fetcher.behavior.status = 401;
    await core.init();
    await core.track("event");
    await core.flush();
    expect(core.getQueueLength()).toBe(0); // dropped, not stuck
    expect(String(errors[0])).toContain("401");
    core.shutdown();
  });
});

describe("sessions via AppState", () => {
  test("long background gap ends the session and starts a new one", async () => {
    const { core, clock } = makeCore({ sessionTimeoutMs: 60_000 });
    await core.init();
    const firstSession = core.getSessionId();

    clock.advance(10_000);
    await core.handleAppStateChange("background");
    clock.advance(120_000); // > timeout
    await core.handleAppStateChange("active");

    expect(core.getSessionId()).not.toBe(firstSession);
    core.shutdown();
  });

  test("brief background hop keeps the session", async () => {
    const { core, clock } = makeCore({ sessionTimeoutMs: 60_000 });
    await core.init();
    const firstSession = core.getSessionId();

    await core.handleAppStateChange("background");
    clock.advance(5_000); // < timeout
    await core.handleAppStateChange("active");

    expect(core.getSessionId()).toBe(firstSession);
    core.shutdown();
  });

  test("session_end carries duration and the old session id", async () => {
    const { core, fetcher, clock } = makeCore({ sessionTimeoutMs: 60_000 });
    await core.init();
    const firstSession = core.getSessionId();

    clock.advance(45_000);
    await core.handleAppStateChange("background"); // flushes session_start
    clock.advance(120_000);
    await core.handleAppStateChange("active");
    await core.flush();

    const all = fetcher.sent.flatMap((b) => b.events);
    const end = all.find((e) => e.type === "session_end")!;
    expect(end.sessionId).toBe(firstSession);
    expect(end.properties?.durationMs).toBe(45_000);
    const starts = all.filter((e) => e.type === "session_start");
    expect(starts).toHaveLength(2);
    expect(starts[1].sessionId).not.toBe(firstSession);
    core.shutdown();
  });
});

describe("identify and error capture", () => {
  test("identify attaches userId to subsequent events", async () => {
    const { core, fetcher } = makeCore();
    await core.init();
    await core.track("before_login");
    await core.identify("user-42", { plan: "pro" });
    await core.track("after_login");
    await core.flush();

    const events = fetcher.sent[0].events;
    expect(events.find((e) => e.name === "before_login")?.userId).toBeUndefined();
    const identifyEvent = events.find((e) => e.type === "identify")!;
    expect(identifyEvent.userId).toBe("user-42");
    expect(identifyEvent.properties).toEqual({ plan: "pro" });
    expect(events.find((e) => e.name === "after_login")?.userId).toBe("user-42");
    core.shutdown();
  });

  test("captureException snapshots breadcrumbs and flushes eagerly", async () => {
    const { core, fetcher } = makeCore();
    await core.init();
    await core.screen("/home");
    await core.track("tapped_generate");

    const boom = new Error("something exploded");
    boom.name = "TypeError";
    await core.captureException(boom, { fatal: true });

    // captureException flushed on its own -- no explicit flush() call.
    const events = fetcher.sent.flatMap((b) => b.events);
    const errorEvent = events.find((e) => e.type === "error")!;
    expect(errorEvent.error).toMatchObject({
      type: "TypeError",
      message: "something exploded",
    });
    expect(errorEvent.properties?.fatal).toBe(true);
    const crumbs = JSON.parse(errorEvent.breadcrumbs!) as { n: string }[];
    expect(crumbs.map((c) => c.n)).toEqual([
      "session_start",
      "/home",
      "tapped_generate",
    ]);
    core.shutdown();
  });

  test("non-Error values are captured safely", async () => {
    const { core, fetcher } = makeCore();
    await core.init();
    await core.captureException("plain string failure");
    const events = fetcher.sent.flatMap((b) => b.events);
    const errorEvent = events.find((e) => e.type === "error")!;
    expect(errorEvent.error?.message).toBe("plain string failure");
    core.shutdown();
  });
});
