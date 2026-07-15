/* eslint-disable */
/**
 * Hand-written stand-in for Convex's generated `ComponentApi` utility
 * (normally produced by `npx convex codegen --component-dir`), describing
 * this component's public function surface from the point of view of an
 * app that mounts it.
 *
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.public.getOverview, { ...args });
 * }
 * ```
 */
import type { FunctionReference } from "convex/server";
import type { Id } from "./dataModel.js";

type PropertyValue = string | number | boolean | null;

type EventType =
  | "session_start"
  | "session_end"
  | "screen"
  | "track"
  | "identify"
  | "error";

type IssueStatus = "open" | "resolved" | "ignored";

type EventContext = {
  appVersion?: string;
  buildNumber?: string;
  osName?: string;
  osVersion?: string;
  deviceModel?: string;
};

type EventInput = {
  id?: string;
  type: EventType;
  name: string;
  occurredAt: number;
  sessionId: string;
  deviceId: string;
  properties?: Record<string, PropertyValue>;
  userId?: string;
  breadcrumbs?: string;
  error?: { type?: string; message: string; stack?: string };
  context?: EventContext;
};

type EventDoc = {
  _id: Id<"events">;
  _creationTime: number;
  appId: Id<"apps">;
  sessionId: string;
  deviceId: string;
  occurredAt: number;
  receivedAt: number;
  eventType: EventType;
  eventName: string;
  properties?: Record<string, PropertyValue>;
  identifiedUserId?: string;
  errorType?: string;
  errorMessage?: string;
  errorStack?: string;
  issueFingerprint?: string;
  breadcrumbs?: string;
  context?: EventContext;
};

type SessionDoc = {
  _id: Id<"sessions">;
  _creationTime: number;
  appId: Id<"apps">;
  sessionId: string;
  deviceId: string;
  startedAt: number;
  lastSeenAt: number;
  endedAt?: number;
  entryScreen?: string;
  exitScreen?: string;
  identifiedUserId?: string;
  eventCount: number;
  errorCount: number;
  context?: EventContext;
};

type IssueDoc = {
  _id: Id<"issues">;
  _creationTime: number;
  appId: Id<"apps">;
  fingerprint: string;
  title: string;
  errorType: string;
  sampleMessage: string;
  sampleStack?: string;
  firstSeenAt: number;
  lastSeenAt: number;
  occurrenceCount: number;
  affectedSessionCount: number;
  lastSessionId: string;
  status: IssueStatus;
};

/**
 * A utility for referencing this component's exposed API.
 *
 * Useful when expecting a parameter like `components.analytics`.
 */
export type ComponentApi<
  Name extends string | undefined = string | undefined,
> = {
  public: {
    createApp: FunctionReference<
      "mutation",
      "public",
      {
        slug: string;
        name: string;
        writeKeyHash: string;
        ingestEnabled?: boolean;
        maxEventsPerHour?: number;
      },
      { appId: string; created: boolean },
      Name
    >;
    ingestBatch: FunctionReference<
      "mutation",
      "public",
      { writeKeyHash: string; batchId?: string; events: EventInput[] },
      { accepted: number; deduped?: boolean },
      Name
    >;
    getOverview: FunctionReference<
      "query",
      "public",
      { slug: string; from: number; to: number; interval: "hour" | "day" },
      {
        series: { bucketStart: number; count: number }[];
        totals: { events: number; sessions: number; errors: number };
        topEvents: { name: string; count: number }[];
        topScreens: { name: string; count: number }[];
      },
      Name
    >;
    getRecentEvents: FunctionReference<
      "query",
      "public",
      { slug: string; limit?: number; eventType?: EventType },
      EventDoc[],
      Name
    >;
    getSessions: FunctionReference<
      "query",
      "public",
      { slug: string; limit?: number },
      SessionDoc[],
      Name
    >;
    getIssues: FunctionReference<
      "query",
      "public",
      { slug: string; status?: IssueStatus; limit?: number },
      IssueDoc[],
      Name
    >;
    getIssueDetail: FunctionReference<
      "query",
      "public",
      { slug: string; fingerprint: string; eventLimit?: number },
      { issue: IssueDoc; recentEvents: EventDoc[] } | null,
      Name
    >;
    setIssueStatus: FunctionReference<
      "mutation",
      "public",
      { slug: string; fingerprint: string; status: IssueStatus },
      null,
      Name
    >;
  };
};
