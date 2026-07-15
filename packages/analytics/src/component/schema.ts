import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const propertyValue = v.union(v.string(), v.number(), v.boolean(), v.null());

const contextValidator = v.object({
  appVersion: v.optional(v.string()),
  buildNumber: v.optional(v.string()),
  osName: v.optional(v.string()),
  osVersion: v.optional(v.string()),
  deviceModel: v.optional(v.string()),
});

export default defineSchema({
  apps: defineTable({
    slug: v.string(),
    name: v.string(),
    writeKeyHash: v.string(),
    settings: v.object({
      // Kill switch: the write key ships inside the app binary and is
      // extractable, so hosts need a way to shut off a spamming key.
      ingestEnabled: v.optional(v.boolean()),
      // Coarse abuse cap, checked against the current hour's overview rollup.
      maxEventsPerHour: v.optional(v.number()),
    }),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_writeKeyHash", ["writeKeyHash"]),

  // Ingest idempotency: one row per accepted batch id. The SDK retries a
  // batch with the same id until acked, so a batch whose response was lost
  // is skipped instead of double-counted.
  // Known limitation: this table has no TTL/cleanup, so it grows unbounded
  // with ingest volume. A retried batch only needs to be deduped within the
  // SDK's own retry window (flushIntervalMs-scale), so old rows are safe to
  // prune; there's just no scheduled job doing that yet.
  batches: defineTable({
    appId: v.id("apps"),
    batchId: v.string(),
  }).index("by_app_batch", ["appId", "batchId"]),

  // One app-open-to-background cycle, bounded client-side by AppState
  // transitions. Rows are upserted from whatever events arrive, so a session
  // killed before its session_end still shows its real activity window via
  // lastSeenAt.
  sessions: defineTable({
    appId: v.id("apps"),
    sessionId: v.string(),
    deviceId: v.string(),
    startedAt: v.number(),
    lastSeenAt: v.number(),
    endedAt: v.optional(v.number()),
    entryScreen: v.optional(v.string()),
    exitScreen: v.optional(v.string()),
    identifiedUserId: v.optional(v.string()),
    eventCount: v.number(),
    errorCount: v.number(),
    context: v.optional(contextValidator),
  })
    .index("by_app_session", ["appId", "sessionId"])
    .index("by_app_startedAt", ["appId", "startedAt"]),

  // Unified stream: analytics and errors share one table so the events
  // preceding an error double as its breadcrumb trail.
  events: defineTable({
    appId: v.id("apps"),
    sessionId: v.string(),
    deviceId: v.string(),
    occurredAt: v.number(),
    receivedAt: v.number(),
    eventType: v.union(
      v.literal("session_start"),
      v.literal("session_end"),
      v.literal("screen"),
      v.literal("track"),
      v.literal("identify"),
      v.literal("error"),
    ),
    eventName: v.string(),
    properties: v.optional(v.record(v.string(), propertyValue)),
    identifiedUserId: v.optional(v.string()),
    // Error events only:
    errorType: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    errorStack: v.optional(v.string()),
    issueFingerprint: v.optional(v.string()),
    breadcrumbs: v.optional(v.string()), // JSON-encoded ring buffer from the SDK
    context: v.optional(contextValidator),
  })
    .index("by_app_occurredAt", ["appId", "occurredAt"])
    .index("by_app_type_occurredAt", ["appId", "eventType", "occurredAt"])
    .index("by_app_session", ["appId", "sessionId"])
    .index("by_app_fingerprint", ["appId", "issueFingerprint", "occurredAt"]),

  // Fingerprinted error groups -- the Sentry-style surface.
  issues: defineTable({
    appId: v.id("apps"),
    fingerprint: v.string(),
    title: v.string(),
    errorType: v.string(),
    sampleMessage: v.string(),
    sampleStack: v.optional(v.string()),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    occurrenceCount: v.number(),
    // Approximate: incremented when an occurrence arrives from a different
    // session than the previous one, so interleaved sessions can overcount.
    affectedSessionCount: v.number(),
    lastSessionId: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("resolved"),
      v.literal("ignored"),
    ),
  })
    .index("by_app_fingerprint", ["appId", "fingerprint"])
    .index("by_app_lastSeen", ["appId", "lastSeenAt"])
    .index("by_app_status_lastSeen", ["appId", "status", "lastSeenAt"]),

  // Pre-aggregated counts, incremented at ingest (delta-merge, never
  // recomputed). Writes spread across shards to avoid OCC contention on hot
  // buckets; reads sum the shards. Dimensions: overview/all, session/all,
  // event/<name>, screen/<name>, error/<fingerprint>.
  rollups: defineTable({
    appId: v.id("apps"),
    interval: v.union(v.literal("hour"), v.literal("day")),
    bucketStart: v.number(),
    dimension: v.string(),
    key: v.string(),
    shard: v.number(),
    count: v.number(),
  })
    .index("by_key_shard", [
      "appId",
      "interval",
      "dimension",
      "key",
      "bucketStart",
      "shard",
    ])
    .index("by_dimension_bucket", ["appId", "interval", "dimension", "bucketStart"]),
});
