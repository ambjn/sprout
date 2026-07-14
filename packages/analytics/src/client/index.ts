import {
  httpActionGeneric,
  type FunctionReference,
  type HttpRouter,
} from "convex/server";
import { ConvexError } from "convex/values";

type IssueStatus = "open" | "resolved" | "ignored";
type EventType =
  | "session_start"
  | "session_end"
  | "screen"
  | "track"
  | "identify"
  | "error";

/**
 * Loosely-typed handle to the mounted Sprout component
 * (`components.sprout` in the host app). Args are typed for DX; return
 * types stay `any` for v1 -- full generated ComponentApi typing comes with
 * real `convex codegen --component-dir` output at publish time.
 */
export type SproutComponent = {
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
      any
    >;
    ingestBatch: FunctionReference<
      "mutation",
      "public",
      { writeKeyHash: string; batchId?: string; events: any[] },
      any
    >;
    getOverview: FunctionReference<
      "query",
      "public",
      { slug: string; from: number; to: number; interval: "hour" | "day" },
      any
    >;
    getRecentEvents: FunctionReference<
      "query",
      "public",
      { slug: string; limit?: number; eventType?: EventType },
      any
    >;
    getSessions: FunctionReference<
      "query",
      "public",
      { slug: string; limit?: number },
      any
    >;
    getIssues: FunctionReference<
      "query",
      "public",
      { slug: string; status?: IssueStatus; limit?: number },
      any
    >;
    getIssueDetail: FunctionReference<
      "query",
      "public",
      { slug: string; fingerprint: string; eventLimit?: number },
      any
    >;
    setIssueStatus: FunctionReference<
      "mutation",
      "public",
      {
        slug: string;
        fingerprint: string;
        status: IssueStatus;
      },
      any
    >;
  };
};

type RunMutationCtx = {
  runMutation: (ref: any, args: any) => Promise<any>;
};
type RunQueryCtx = {
  runQuery: (ref: any, args: any) => Promise<any>;
};

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

/** HTTP status for a ConvexError code thrown by the component's ingest. */
const INGEST_ERROR_STATUS: Record<string, number> = {
  invalid_write_key: 401,
  ingest_disabled: 403,
  rate_limited: 429,
  batch_too_large: 400,
};

export class Sprout {
  constructor(public component: SproutComponent) {}

  /** Register an app (idempotent upsert by slug). Call once from a setup mutation. */
  async createApp(
    ctx: RunMutationCtx,
    args: {
      slug: string;
      name: string;
      writeKey: string;
      ingestEnabled?: boolean;
      maxEventsPerHour?: number;
    },
  ): Promise<{ appId: string; created: boolean }> {
    const writeKeyHash = await sha256Hex(args.writeKey);
    return await ctx.runMutation(this.component.public.createApp, {
      slug: args.slug,
      name: args.name,
      writeKeyHash,
      ingestEnabled: args.ingestEnabled,
      maxEventsPerHour: args.maxEventsPerHour,
    });
  }

  /**
   * Mount the ingest HTTP endpoint on the host's router (convex/http.ts):
   *
   *   const sprout = new Sprout(components.sprout);
   *   sprout.registerRoutes(http);
   *
   * The SDK POSTs `{ writeKey, batchId, events }` to
   * `https://<deployment>.convex.site/sprout/ingest`.
   */
  registerRoutes(http: HttpRouter, opts?: { path?: string }) {
    const path = opts?.path ?? "/sprout/ingest";
    const component = this.component;

    http.route({
      path,
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        let body: { writeKey?: string; batchId?: string; events?: unknown[] };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: JSON_HEADERS,
          });
        }
        if (typeof body.writeKey !== "string" || !Array.isArray(body.events)) {
          return new Response(
            JSON.stringify({ error: "Expected { writeKey, events }" }),
            { status: 400, headers: JSON_HEADERS },
          );
        }
        const writeKeyHash = await sha256Hex(body.writeKey);
        try {
          const result = await ctx.runMutation(component.public.ingestBatch, {
            writeKeyHash,
            batchId:
              typeof body.batchId === "string" ? body.batchId : undefined,
            events: body.events,
          });
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: JSON_HEADERS,
          });
        } catch (error) {
          // Expected failures arrive as ConvexError with a code; map to a
          // status the SDK understands (400/401 drop, 429/5xx back off).
          if (
            error instanceof ConvexError &&
            error.data !== null &&
            typeof error.data === "object"
          ) {
            const { code, message } = error.data as {
              code?: string;
              message?: string;
            };
            const status = (code && INGEST_ERROR_STATUS[code]) || 400;
            return new Response(
              JSON.stringify({ error: code ?? "bad_request", message }),
              { status, headers: JSON_HEADERS },
            );
          }
          // Unexpected failure: 5xx so clients retry instead of dropping.
          return new Response(JSON.stringify({ error: "Ingest failed" }), {
            status: 500,
            headers: JSON_HEADERS,
          });
        }
      }),
    });

    http.route({
      path,
      method: "OPTIONS",
      handler: httpActionGeneric(async () => {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }),
    });
  }

  // Read passthroughs for the host's dashboard functions.
  overview(
    ctx: RunQueryCtx,
    args: { slug: string; from: number; to: number; interval: "hour" | "day" },
  ) {
    return ctx.runQuery(this.component.public.getOverview, args);
  }
  recentEvents(
    ctx: RunQueryCtx,
    args: { slug: string; limit?: number; eventType?: EventType },
  ) {
    return ctx.runQuery(this.component.public.getRecentEvents, args);
  }
  sessions(ctx: RunQueryCtx, args: { slug: string; limit?: number }) {
    return ctx.runQuery(this.component.public.getSessions, args);
  }
  issues(
    ctx: RunQueryCtx,
    args: { slug: string; status?: IssueStatus; limit?: number },
  ) {
    return ctx.runQuery(this.component.public.getIssues, args);
  }
  issueDetail(
    ctx: RunQueryCtx,
    args: { slug: string; fingerprint: string; eventLimit?: number },
  ) {
    return ctx.runQuery(this.component.public.getIssueDetail, args);
  }

  // Write passthroughs (dashboard actions).
  setIssueStatus(
    ctx: RunMutationCtx,
    args: { slug: string; fingerprint: string; status: IssueStatus },
  ) {
    return ctx.runMutation(this.component.public.setIssueStatus, args);
  }
}
