export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** Max events accepted in one ingest batch. */
export const MAX_BATCH_SIZE = 100;
/** Max property keys kept per event (extras silently dropped). */
export const MAX_PROPERTY_KEYS = 32;
/** Max length of a string property value (longer values truncated). */
export const MAX_PROPERTY_VALUE_LENGTH = 1000;
/** Shards per rollup bucket; concurrent writers pick one at random. */
export const SHARD_COUNT = 8;
/** occurredAt clamping: reject client clocks further out than these. */
export const MAX_FUTURE_SKEW_MS = 60 * 1000;
export const MAX_PAST_SKEW_MS = 30 * DAY_MS;
