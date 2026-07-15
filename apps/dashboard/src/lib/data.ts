import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { buildFixtures } from "./fixtures";
import { RANGES, type RangeKey, DEFAULT_RANGE } from "./ranges";
import type { DashboardData, IssueRow } from "./types";

const TABLE_LIMIT = 100;

// Runs entirely client-side (see DASHBOARD.md) -- the dashboard key is
// intentionally exposed to the browser bundle, unlike the old NEXT_PUBLIC_-less
// server-only SPROUT_DASHBOARD_KEY. Safe under the localhost-only trust model
// `dashboard` requires; not safe if this bundle is ever served beyond localhost.
//
// Config comes from window.__SPROUT_CONFIG__ first: this static bundle is built
// once (at this repo's own publish time) and shipped inside @sprout-convex/analytics, so
// per-consumer values can't be baked in via import.meta.env at build time -- `dashboard`
// injects them into index.html at serve time instead (see src/cli/dashboard.ts).
// import.meta.env stays as the fallback for plain `bun run dev` against a local
// .env, per STEPS.md.
function resolveConfig(): { convexUrl: string; dashboardKey: string } | null {
  const runtimeConfig = window.__SPROUT_CONFIG__;
  const convexUrl = runtimeConfig?.convexUrl ?? import.meta.env.VITE_CONVEX_URL;
  const dashboardKey = runtimeConfig?.dashboardKey ?? import.meta.env.VITE_SPROUT_DASHBOARD_KEY;
  if (!convexUrl || !dashboardKey) return null;
  return { convexUrl, dashboardKey };
}

export async function getDashboardData(
  range: RangeKey = DEFAULT_RANGE,
): Promise<DashboardData> {
  const config = resolveConfig();
  if (!config) {
    return buildFixtures(range);
  }

  try {
    const client = new ConvexHttpClient(config.convexUrl);
    const { dashboardKey } = config;
    const { ms, interval } = RANGES[range];
    const to = Date.now();
    const from = to - ms;
    const previousFrom = from - ms;

    const [overview, previousOverview, sessions, issues] = await Promise.all([
      client.query(anyApi.sprout.overview, { dashboardKey, from, to, interval }),
      client.query(anyApi.sprout.overview, {
        dashboardKey,
        from: previousFrom,
        to: from,
        interval,
      }),
      client.query(anyApi.sprout.sessions, { dashboardKey, limit: TABLE_LIMIT }),
      client.query(anyApi.sprout.issues, { dashboardKey, limit: TABLE_LIMIT }),
    ]);

    return {
      overview,
      previousTotals: previousOverview?.totals,
      sessions,
      issues,
      isDemo: false,
    };
  } catch (error) {
    console.error("[Sprout dashboard] Falling back to demo data:", error);
    return buildFixtures(range);
  }
}

/**
 * Persist an issue-status change via the host's `sprout:setIssueStatus`
 * mutation. Returns true when the write landed (or when running against
 * demo data, where a local-only change is the correct behavior).
 */
export async function updateIssueStatus(
  fingerprint: string,
  status: IssueRow["status"],
): Promise<boolean> {
  const config = resolveConfig();
  if (!config) return true; // demo mode: keep the optimistic local change

  try {
    const client = new ConvexHttpClient(config.convexUrl);
    await client.mutation(anyApi.sprout.setIssueStatus, {
      dashboardKey: config.dashboardKey,
      fingerprint,
      status,
    });
    return true;
  } catch (error) {
    console.error("[Sprout dashboard] Failed to update issue status:", error);
    return false;
  }
}
