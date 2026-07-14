import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { buildFixtures } from "./fixtures";
import type { DashboardData } from "./types";

const HOUR_MS = 60 * 60 * 1000;

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
export async function getDashboardData(): Promise<DashboardData> {
  const runtimeConfig = window.__SPROUT_CONFIG__;
  const convexUrl = runtimeConfig?.convexUrl ?? import.meta.env.VITE_CONVEX_URL;
  const dashboardKey = runtimeConfig?.dashboardKey ?? import.meta.env.VITE_SPROUT_DASHBOARD_KEY;

  if (!convexUrl || !dashboardKey) {
    return buildFixtures();
  }

  try {
    const client = new ConvexHttpClient(convexUrl);
    const to = Date.now();
    const from = to - 24 * HOUR_MS;
    const previousFrom = from - 24 * HOUR_MS;

    const [overview, previousOverview, sessions, issues] = await Promise.all([
      client.query(anyApi.sprout.overview, { dashboardKey, from, to, interval: "hour" }),
      client.query(anyApi.sprout.overview, {
        dashboardKey,
        from: previousFrom,
        to: from,
        interval: "hour",
      }),
      client.query(anyApi.sprout.sessions, { dashboardKey, limit: 20 }),
      client.query(anyApi.sprout.issues, { dashboardKey, limit: 20 }),
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
    return buildFixtures();
  }
}
