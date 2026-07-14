export type SproutEventType =
  | "session_start"
  | "session_end"
  | "screen"
  | "track"
  | "identify"
  | "error";

export type PropertyValue = string | number | boolean | null;

export type SproutContext = {
  appVersion?: string;
  buildNumber?: string;
  osName?: string;
  osVersion?: string;
  deviceModel?: string;
};

/**
 * Wire format — must contain ONLY fields the component's ingest validator
 * accepts (Convex object validators reject unknown keys).
 */
export type SproutEvent = {
  /** Client-generated unique id; the first event's id names its batch, which
   * the server uses to dedup retried batches. */
  id: string;
  type: SproutEventType;
  name: string;
  occurredAt: number;
  sessionId: string;
  deviceId: string;
  properties?: Record<string, PropertyValue>;
  userId?: string;
  breadcrumbs?: string;
  error?: { type?: string; message: string; stack?: string };
  context?: SproutContext;
};

/** Minimal async KV interface — AsyncStorage satisfies it. */
export interface QueueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface SproutCoreOptions {
  /** Full URL of the host app's ingest route, e.g. https://<deployment>.convex.site/sprout/ingest */
  ingestUrl: string;
  writeKey: string;
  storage: QueueStorage;
  fetchFn?: typeof fetch;
  now?: () => number;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  maxQueueSize?: number;
  sessionTimeoutMs?: number;
  breadcrumbLimit?: number;
  getContext?: () => SproutContext | undefined;
  /** SDK-internal failures (storage, serialization). Never thrown into the app. */
  onInternalError?: (error: unknown) => void;
}
