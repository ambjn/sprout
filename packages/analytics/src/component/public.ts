import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import type { Id } from "./_generated/dataModel.js";
import { MAX_BATCH_SIZE, SHARD_COUNT } from "./constants.js";
import {
  bucketSize,
  capProperties,
  clampOccurredAt,
  fingerprintHash,
  floorToBucket,
  topStackFrame,
  type Interval,
} from "./helpers.js";

const propertyValue = v.union(v.string(), v.number(), v.boolean(), v.null());

const contextValidator = v.object({
  appVersion: v.optional(v.string()),
  buildNumber: v.optional(v.string()),
  osName: v.optional(v.string()),
  osVersion: v.optional(v.string()),
  deviceModel: v.optional(v.string()),
});

const eventTypeValidator = v.union(
  v.literal("session_start"),
  v.literal("session_end"),
  v.literal("screen"),
  v.literal("track"),
  v.literal("identify"),
  v.literal("error"),
);

const eventInputValidator = v.object({
  // Client-generated id; the SDK uses the first event's id as the batch id.
  id: v.optional(v.string()),
  type: eventTypeValidator,
  name: v.string(),
  occurredAt: v.number(),
  sessionId: v.string(),
  deviceId: v.string(),
  properties: v.optional(v.record(v.string(), propertyValue)),
  userId: v.optional(v.string()),
  breadcrumbs: v.optional(v.string()),
  error: v.optional(
    v.object({
      type: v.optional(v.string()),
      message: v.string(),
      stack: v.optional(v.string()),
    }),
  ),
  context: v.optional(contextValidator),
});

const intervalValidator = v.union(v.literal("hour"), v.literal("day"));

const issueStatusValidator = v.union(
  v.literal("open"),
  v.literal("resolved"),
  v.literal("ignored"),
);

// Full-document validators for the read API (`returns` pins the wire contract).
const eventDoc = v.object({
  _id: v.id("events"),
  _creationTime: v.number(),
  appId: v.id("apps"),
  sessionId: v.string(),
  deviceId: v.string(),
  occurredAt: v.number(),
  receivedAt: v.number(),
  eventType: eventTypeValidator,
  eventName: v.string(),
  properties: v.optional(v.record(v.string(), propertyValue)),
  identifiedUserId: v.optional(v.string()),
  errorType: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  errorStack: v.optional(v.string()),
  issueFingerprint: v.optional(v.string()),
  breadcrumbs: v.optional(v.string()),
  context: v.optional(contextValidator),
});

const sessionDoc = v.object({
  _id: v.id("sessions"),
  _creationTime: v.number(),
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
});

const issueDoc = v.object({
  _id: v.id("issues"),
  _creationTime: v.number(),
  appId: v.id("apps"),
  fingerprint: v.string(),
  title: v.string(),
  errorType: v.string(),
  sampleMessage: v.string(),
  sampleStack: v.optional(v.string()),
  firstSeenAt: v.number(),
  lastSeenAt: v.number(),
  occurrenceCount: v.number(),
  affectedSessionCount: v.number(),
  lastSessionId: v.string(),
  status: issueStatusValidator,
});

const rollupDoc = v.object({
  _id: v.id("rollups"),
  _creationTime: v.number(),
  appId: v.id("apps"),
  interval: intervalValidator,
  bucketStart: v.number(),
  dimension: v.string(),
  key: v.string(),
  shard: v.number(),
  count: v.number(),
});

const keyCountValidator = v.object({ name: v.string(), count: v.number() });

/** Expected ingest failures carry a machine-readable code the HTTP layer maps
 * to a status: invalid_write_key -> 401, ingest_disabled -> 403,
 * rate_limited -> 429, batch_too_large -> 400. */
function ingestError(code: string, message: string): ConvexError<{ code: string; message: string }> {
  return new ConvexError({ code, message });
}

// ---------------------------------------------------------------------------
// App registration
// ---------------------------------------------------------------------------

export const createApp = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    writeKeyHash: v.string(),
    ingestEnabled: v.optional(v.boolean()),
    maxEventsPerHour: v.optional(v.number()),
  },
  returns: v.object({ appId: v.string(), created: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("apps")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        writeKeyHash: args.writeKeyHash,
        settings: {
          ingestEnabled: args.ingestEnabled ?? existing.settings.ingestEnabled,
          maxEventsPerHour:
            args.maxEventsPerHour ?? existing.settings.maxEventsPerHour,
        },
      });
      return { appId: existing._id as string, created: false };
    }
    const appId = await ctx.db.insert("apps", {
      slug: args.slug,
      name: args.name,
      writeKeyHash: args.writeKeyHash,
      settings: {
        ingestEnabled: args.ingestEnabled,
        maxEventsPerHour: args.maxEventsPerHour,
      },
      createdAt: Date.now(),
    });
    return { appId: appId as string, created: true };
  },
});

// ---------------------------------------------------------------------------
// Ingest
// ---------------------------------------------------------------------------

type RollupDelta = {
  interval: Interval;
  dimension: string;
  key: string;
  bucketStart: number;
  count: number;
};

function addDelta(
  deltas: Map<string, RollupDelta>,
  interval: Interval,
  dimension: string,
  key: string,
  occurredAt: number,
) {
  const bucketStart = floorToBucket(occurredAt, interval);
  const mapKey = `${interval}|${dimension}|${key}|${bucketStart}`;
  const existing = deltas.get(mapKey);
  if (existing) {
    existing.count += 1;
  } else {
    deltas.set(mapKey, { interval, dimension, key, bucketStart, count: 1 });
  }
}

// Per-batch in-memory aggregates: a batch usually holds many events for the
// same session (and often the same issue), so folding them together first
// turns N reads + N patches on one row into 1 read + 1 write. This also
// shrinks the mutation's OCC read set.
type SessionAgg = {
  deviceId: string;
  minOccurredAt: number;
  maxOccurredAt: number;
  eventCount: number;
  errorCount: number;
  endedAt: number | undefined;
  firstScreen: string | undefined;
  lastScreen: string | undefined;
  userId: string | undefined;
  context: Record<string, unknown> | undefined;
};

type IssueAgg = {
  errorType: string;
  message: string;
  stack: string | undefined;
  firstSeenAt: number;
  lastSeenAt: number;
  occurrenceCount: number;
  firstSessionId: string;
  lastSessionId: string;
  // sessionId changes between consecutive occurrences within this batch,
  // mirroring the per-event affectedSessionCount heuristic.
  sessionTransitions: number;
};

export const ingestBatch = mutation({
  args: {
    writeKeyHash: v.string(),
    batchId: v.optional(v.string()),
    events: v.array(eventInputValidator),
  },
  returns: v.object({
    accepted: v.number(),
    deduped: v.optional(v.boolean()),
  }),
  handler: async (ctx, { writeKeyHash, batchId, events }) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_writeKeyHash", (q) => q.eq("writeKeyHash", writeKeyHash))
      .unique();
    if (!app) throw ingestError("invalid_write_key", "Invalid write key");
    if (app.settings.ingestEnabled === false) {
      throw ingestError("ingest_disabled", "Ingest is disabled for this app");
    }
    if (events.length > MAX_BATCH_SIZE) {
      throw ingestError(
        "batch_too_large",
        `Batch too large (max ${MAX_BATCH_SIZE} events)`,
      );
    }

    const receivedAt = Date.now();

    // Idempotency: a retried batch (response lost, app killed mid-flush)
    // arrives with the same batchId and is acked without re-counting.
    if (batchId) {
      const seen = await ctx.db
        .query("batches")
        .withIndex("by_app_batch", (q) =>
          q.eq("appId", app._id).eq("batchId", batchId),
        )
        .unique();
      if (seen) return { accepted: events.length, deduped: true };
      await ctx.db.insert("batches", { appId: app._id, batchId });
    }

    // Coarse rate limit against the current hour's overview rollup. Note:
    // reading every shard of the hot bucket serializes concurrent batches on
    // OCC, so this trades ingest parallelism for abuse protection -- only
    // enabled when the host opts in via settings.maxEventsPerHour.
    const maxPerHour = app.settings.maxEventsPerHour;
    if (maxPerHour !== undefined) {
      const bucketStart = floorToBucket(receivedAt, "hour");
      const shardRows = await ctx.db
        .query("rollups")
        .withIndex("by_dimension_bucket", (q) =>
          q
            .eq("appId", app._id)
            .eq("interval", "hour")
            .eq("dimension", "overview")
            .eq("bucketStart", bucketStart),
        )
        .collect();
      const currentHourCount = shardRows.reduce((sum, r) => sum + r.count, 0);
      if (currentHourCount + events.length > maxPerHour) {
        throw ingestError("rate_limited", "Hourly event limit reached");
      }
    }

    const deltas = new Map<string, RollupDelta>();
    const sessionAggs = new Map<string, SessionAgg>();
    const issueAggs = new Map<string, IssueAgg>();

    for (const event of events) {
      const occurredAt = clampOccurredAt(event.occurredAt, receivedAt);

      // Error events: group into an issue via fingerprint.
      let issueFingerprint: string | undefined;
      if (event.type === "error" && event.error) {
        const errorType = event.error.type ?? "Error";
        const groupingKey =
          topStackFrame(event.error.stack) ?? event.error.message;
        issueFingerprint = fingerprintHash(`${errorType}|${groupingKey}`);
        const agg = issueAggs.get(issueFingerprint);
        if (agg) {
          agg.occurrenceCount += 1;
          agg.lastSeenAt = Math.max(agg.lastSeenAt, occurredAt);
          agg.firstSeenAt = Math.min(agg.firstSeenAt, occurredAt);
          if (event.sessionId !== agg.lastSessionId) {
            agg.sessionTransitions += 1;
            agg.lastSessionId = event.sessionId;
          }
        } else {
          issueAggs.set(issueFingerprint, {
            errorType,
            message: event.error.message,
            stack: event.error.stack,
            firstSeenAt: occurredAt,
            lastSeenAt: occurredAt,
            occurrenceCount: 1,
            firstSessionId: event.sessionId,
            lastSessionId: event.sessionId,
            sessionTransitions: 0,
          });
        }
      }

      await ctx.db.insert("events", {
        appId: app._id,
        sessionId: event.sessionId,
        deviceId: event.deviceId,
        occurredAt,
        receivedAt,
        eventType: event.type,
        eventName: event.name.slice(0, 200),
        properties: capProperties(event.properties),
        identifiedUserId: event.userId,
        errorType: event.error?.type,
        errorMessage: event.error?.message.slice(0, 1000),
        errorStack: event.error?.stack?.slice(0, 8000),
        issueFingerprint,
        breadcrumbs: event.breadcrumbs?.slice(0, 8000),
        context: event.context,
      });

      const session = sessionAggs.get(event.sessionId);
      if (!session) {
        sessionAggs.set(event.sessionId, {
          deviceId: event.deviceId,
          minOccurredAt: occurredAt,
          maxOccurredAt: occurredAt,
          eventCount: 1,
          errorCount: event.type === "error" ? 1 : 0,
          endedAt: event.type === "session_end" ? occurredAt : undefined,
          firstScreen: event.type === "screen" ? event.name : undefined,
          lastScreen: event.type === "screen" ? event.name : undefined,
          userId: event.userId,
          context: event.context,
        });
      } else {
        session.minOccurredAt = Math.min(session.minOccurredAt, occurredAt);
        session.maxOccurredAt = Math.max(session.maxOccurredAt, occurredAt);
        session.eventCount += 1;
        if (event.type === "error") session.errorCount += 1;
        if (event.type === "session_end") session.endedAt = occurredAt;
        if (event.type === "screen") {
          if (!session.firstScreen) session.firstScreen = event.name;
          session.lastScreen = event.name;
        }
        if (event.userId && !session.userId) session.userId = event.userId;
        if (event.context && !session.context) session.context = event.context;
      }

      for (const interval of ["hour", "day"] as const) {
        addDelta(deltas, interval, "overview", "all", occurredAt);
        if (event.type === "session_start") {
          addDelta(deltas, interval, "session", "all", occurredAt);
        } else if (event.type === "track") {
          addDelta(deltas, interval, "event", event.name, occurredAt);
        } else if (event.type === "screen") {
          addDelta(deltas, interval, "screen", event.name, occurredAt);
        } else if (event.type === "error" && issueFingerprint) {
          addDelta(deltas, interval, "error", issueFingerprint, occurredAt);
        }
      }
    }

    for (const [sessionId, agg] of sessionAggs) {
      await upsertSession(ctx, app._id, sessionId, agg);
    }
    for (const [fingerprint, agg] of issueAggs) {
      await upsertIssue(ctx, app._id, fingerprint, agg);
    }

    // Flush accumulated deltas: one random shard per delta group, so a batch
    // does at most one write per (interval, dimension, key, bucket) and
    // concurrent batches usually land on different shard rows.
    for (const delta of deltas.values()) {
      const shard = Math.floor(Math.random() * SHARD_COUNT);
      const existing = await ctx.db
        .query("rollups")
        .withIndex("by_key_shard", (q) =>
          q
            .eq("appId", app._id)
            .eq("interval", delta.interval)
            .eq("dimension", delta.dimension)
            .eq("key", delta.key)
            .eq("bucketStart", delta.bucketStart)
            .eq("shard", shard),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { count: existing.count + delta.count });
      } else {
        await ctx.db.insert("rollups", {
          appId: app._id,
          interval: delta.interval,
          dimension: delta.dimension,
          key: delta.key,
          bucketStart: delta.bucketStart,
          shard,
          count: delta.count,
        });
      }
    }

    return { accepted: events.length };
  },
});

async function upsertSession(
  ctx: { db: any },
  appId: Id<"apps">,
  sessionId: string,
  agg: SessionAgg,
) {
  const existing = await ctx.db
    .query("sessions")
    .withIndex("by_app_session", (q: any) =>
      q.eq("appId", appId).eq("sessionId", sessionId),
    )
    .unique();

  if (!existing) {
    await ctx.db.insert("sessions", {
      appId,
      sessionId,
      deviceId: agg.deviceId,
      startedAt: agg.minOccurredAt,
      lastSeenAt: agg.maxOccurredAt,
      endedAt: agg.endedAt,
      entryScreen: agg.firstScreen,
      exitScreen: agg.lastScreen,
      identifiedUserId: agg.userId,
      eventCount: agg.eventCount,
      errorCount: agg.errorCount,
      context: agg.context,
    });
    return;
  }

  const patch: Record<string, unknown> = {
    lastSeenAt: Math.max(existing.lastSeenAt, agg.maxOccurredAt),
    eventCount: existing.eventCount + agg.eventCount,
  };
  if (agg.minOccurredAt < existing.startedAt) patch.startedAt = agg.minOccurredAt;
  if (agg.errorCount > 0) patch.errorCount = existing.errorCount + agg.errorCount;
  if (agg.endedAt !== undefined) patch.endedAt = agg.endedAt;
  if (agg.firstScreen && !existing.entryScreen) patch.entryScreen = agg.firstScreen;
  if (agg.lastScreen) patch.exitScreen = agg.lastScreen;
  if (agg.userId && !existing.identifiedUserId) {
    patch.identifiedUserId = agg.userId;
  }
  if (agg.context && !existing.context) patch.context = agg.context;
  await ctx.db.patch(existing._id, patch);
}

async function upsertIssue(
  ctx: { db: any },
  appId: Id<"apps">,
  fingerprint: string,
  agg: IssueAgg,
) {
  const existing = await ctx.db
    .query("issues")
    .withIndex("by_app_fingerprint", (q: any) =>
      q.eq("appId", appId).eq("fingerprint", fingerprint),
    )
    .unique();

  if (!existing) {
    await ctx.db.insert("issues", {
      appId,
      fingerprint,
      title: `${agg.errorType}: ${agg.message.slice(0, 120)}`,
      errorType: agg.errorType,
      sampleMessage: agg.message.slice(0, 1000),
      sampleStack: agg.stack?.slice(0, 8000),
      firstSeenAt: agg.firstSeenAt,
      lastSeenAt: agg.lastSeenAt,
      occurrenceCount: agg.occurrenceCount,
      affectedSessionCount: 1 + agg.sessionTransitions,
      lastSessionId: agg.lastSessionId,
      status: "open",
    });
    return;
  }

  const patch: Record<string, unknown> = {
    lastSeenAt: Math.max(existing.lastSeenAt, agg.lastSeenAt),
    occurrenceCount: existing.occurrenceCount + agg.occurrenceCount,
  };
  const boundaryTransition = agg.firstSessionId !== existing.lastSessionId ? 1 : 0;
  const newSessions = boundaryTransition + agg.sessionTransitions;
  if (newSessions > 0) {
    patch.affectedSessionCount = existing.affectedSessionCount + newSessions;
  }
  if (agg.lastSessionId !== existing.lastSessionId) {
    patch.lastSessionId = agg.lastSessionId;
  }
  // A resolved issue that reoccurs is a regression -- reopen it.
  if (existing.status === "resolved") patch.status = "open";
  await ctx.db.patch(existing._id, patch);
}

// ---------------------------------------------------------------------------
// Read API (powers the dashboard)
// ---------------------------------------------------------------------------

async function requireApp(ctx: { db: any }, slug: string) {
  const app = await ctx.db
    .query("apps")
    .withIndex("by_slug", (q: any) => q.eq("slug", slug))
    .unique();
  if (!app) throw new Error(`Unknown app: ${slug}`);
  return app;
}

async function sumRollupRange(
  ctx: { db: any },
  appId: Id<"apps">,
  interval: Interval,
  dimension: string,
  from: number,
  to: number,
): Promise<Map<string, Map<number, number>>> {
  // key -> bucketStart -> count, shards summed together.
  const rows = await ctx.db
    .query("rollups")
    .withIndex("by_dimension_bucket", (q: any) =>
      q
        .eq("appId", appId)
        .eq("interval", interval)
        .eq("dimension", dimension)
        .gte("bucketStart", from)
        .lt("bucketStart", to),
    )
    .collect();
  const byKey = new Map<string, Map<number, number>>();
  for (const row of rows) {
    let buckets = byKey.get(row.key);
    if (!buckets) {
      buckets = new Map();
      byKey.set(row.key, buckets);
    }
    buckets.set(row.bucketStart, (buckets.get(row.bucketStart) ?? 0) + row.count);
  }
  return byKey;
}

function topKeys(
  byKey: Map<string, Map<number, number>>,
  limit: number,
): { name: string; count: number }[] {
  return [...byKey.entries()]
    .map(([name, buckets]) => ({
      name,
      count: [...buckets.values()].reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export const getOverview = query({
  args: {
    slug: v.string(),
    from: v.number(),
    to: v.number(),
    interval: intervalValidator,
  },
  returns: v.object({
    series: v.array(v.object({ bucketStart: v.number(), count: v.number() })),
    totals: v.object({
      events: v.number(),
      sessions: v.number(),
      errors: v.number(),
    }),
    topEvents: v.array(keyCountValidator),
    topScreens: v.array(keyCountValidator),
  }),
  handler: async (ctx, { slug, from, to, interval }) => {
    const app = await requireApp(ctx, slug);
    const alignedFrom = floorToBucket(from, interval);

    const [overview, sessions, errors, events, screens] = await Promise.all([
      sumRollupRange(ctx, app._id, interval, "overview", alignedFrom, to),
      sumRollupRange(ctx, app._id, interval, "session", alignedFrom, to),
      sumRollupRange(ctx, app._id, interval, "error", alignedFrom, to),
      sumRollupRange(ctx, app._id, interval, "event", alignedFrom, to),
      sumRollupRange(ctx, app._id, interval, "screen", alignedFrom, to),
    ]);

    const allBuckets = overview.get("all") ?? new Map<number, number>();
    const series: { bucketStart: number; count: number }[] = [];
    const size = bucketSize(interval);
    for (let b = alignedFrom; b < to; b += size) {
      series.push({ bucketStart: b, count: allBuckets.get(b) ?? 0 });
    }

    const sum = (m: Map<string, Map<number, number>>) =>
      [...m.values()].reduce(
        (total, buckets) =>
          total + [...buckets.values()].reduce((a, b) => a + b, 0),
        0,
      );

    return {
      series,
      totals: {
        events: sum(overview),
        sessions: sum(sessions),
        errors: sum(errors),
      },
      topEvents: topKeys(events, 10),
      topScreens: topKeys(screens, 10),
    };
  },
});

export const getRecentEvents = query({
  args: {
    slug: v.string(),
    limit: v.optional(v.number()),
    eventType: v.optional(eventTypeValidator),
  },
  returns: v.array(eventDoc),
  handler: async (ctx, { slug, limit, eventType }) => {
    const app = await requireApp(ctx, slug);
    const n = Math.min(limit ?? 50, 200);
    if (eventType) {
      return await ctx.db
        .query("events")
        .withIndex("by_app_type_occurredAt", (q: any) =>
          q.eq("appId", app._id).eq("eventType", eventType),
        )
        .order("desc")
        .take(n);
    }
    return await ctx.db
      .query("events")
      .withIndex("by_app_occurredAt", (q: any) => q.eq("appId", app._id))
      .order("desc")
      .take(n);
  },
});

export const getSessions = query({
  args: { slug: v.string(), limit: v.optional(v.number()) },
  returns: v.array(sessionDoc),
  handler: async (ctx, { slug, limit }) => {
    const app = await requireApp(ctx, slug);
    return await ctx.db
      .query("sessions")
      .withIndex("by_app_startedAt", (q: any) => q.eq("appId", app._id))
      .order("desc")
      .take(Math.min(limit ?? 50, 200));
  },
});

export const getIssues = query({
  args: {
    slug: v.string(),
    status: v.optional(issueStatusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(issueDoc),
  handler: async (ctx, { slug, status, limit }) => {
    const app = await requireApp(ctx, slug);
    const n = Math.min(limit ?? 50, 200);
    if (status) {
      return await ctx.db
        .query("issues")
        .withIndex("by_app_status_lastSeen", (q: any) =>
          q.eq("appId", app._id).eq("status", status),
        )
        .order("desc")
        .take(n);
    }
    return await ctx.db
      .query("issues")
      .withIndex("by_app_lastSeen", (q: any) => q.eq("appId", app._id))
      .order("desc")
      .take(n);
  },
});

export const getIssueDetail = query({
  args: {
    slug: v.string(),
    fingerprint: v.string(),
    eventLimit: v.optional(v.number()),
  },
  returns: v.union(
    v.null(),
    v.object({ issue: issueDoc, recentEvents: v.array(eventDoc) }),
  ),
  handler: async (ctx, { slug, fingerprint, eventLimit }) => {
    const app = await requireApp(ctx, slug);
    const issue = await ctx.db
      .query("issues")
      .withIndex("by_app_fingerprint", (q: any) =>
        q.eq("appId", app._id).eq("fingerprint", fingerprint),
      )
      .unique();
    if (!issue) return null;
    const recentEvents = await ctx.db
      .query("events")
      .withIndex("by_app_fingerprint", (q: any) =>
        q.eq("appId", app._id).eq("issueFingerprint", fingerprint),
      )
      .order("desc")
      .take(Math.min(eventLimit ?? 20, 100));
    return { issue, recentEvents };
  },
});

export const setIssueStatus = mutation({
  args: {
    slug: v.string(),
    fingerprint: v.string(),
    status: issueStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, { slug, fingerprint, status }) => {
    const app = await requireApp(ctx, slug);
    const issue = await ctx.db
      .query("issues")
      .withIndex("by_app_fingerprint", (q: any) =>
        q.eq("appId", app._id).eq("fingerprint", fingerprint),
      )
      .unique();
    if (!issue) throw new Error(`Unknown issue: ${fingerprint}`);
    await ctx.db.patch(issue._id, { status });
    return null;
  },
});

// Test/debug surface: raw shard rows for one rollup key, so tests can assert
// that writes actually spread across shards.
export const inspectRollups = query({
  args: {
    slug: v.string(),
    interval: intervalValidator,
    dimension: v.string(),
    key: v.string(),
  },
  returns: v.array(rollupDoc),
  handler: async (ctx, { slug, interval, dimension, key }) => {
    const app = await requireApp(ctx, slug);
    return await ctx.db
      .query("rollups")
      .withIndex("by_key_shard", (q: any) =>
        q
          .eq("appId", app._id)
          .eq("interval", interval)
          .eq("dimension", dimension)
          .eq("key", key),
      )
      .collect();
  },
});
