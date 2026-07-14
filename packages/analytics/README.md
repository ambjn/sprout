```
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~                                          ~
~                                _         ~
~      ___ _ __  _ __ ___  _   _| |_       ~
~     / __| '_ \| '__/ _ \| | | | __|      ~
~     \__ \ |_) | | | (_) | |_| | |_       ~
~     |___/ .__/|_|  \___/ \__,_|\__|      ~
~         |_|                              ~
~                                          ~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

# @sprout-convex/analytics

Insights on how your React Native Expo app is used, with none of the infra.

- No ingestion service to run
- No database to provision
- No SLA to babysit

It's one [Convex component](https://www.convex.dev/components): session and
screen tracking, custom events, and error tracking with fingerprinted issues,
breadcrumbs, and stack traces — all running inside your own Convex
deployment, so your data never leaves it.

> **Status: pre-1.0.** The SDK, Convex component, CLI, and dashboard are all
> implemented and work end-to-end — APIs may still shift before 0.1.0.

## What you get

- **Expo SDK** — `track` / `screen` / `identify` / `captureException`, automatic
  session boundaries via `AppState`, global JS error capture, screen
  autocapture for expo-router, and an offline-durable event queue that
  survives app kills and retries with exactly-once ingest.
- **Convex component** — batched ingest behind your own HTTP endpoint (write
  key + kill switch + optional rate limit), sharded rollup counters that
  don't contend under concurrent writes, and fingerprinted error issues with
  open/resolved/ignored workflow.
- **CLI** — `sprout init` wires the component, ingest route, registration
  mutation, dashboard queries, and Expo root layout into an existing Convex +
  Expo app in one pass; `sprout dashboard` serves the dashboard against your
  deployment. Nothing to host.
- **Local dashboard** — a prebuilt insights UI (overview, events, sessions,
  issues) served by `sprout dashboard`.

## Install

```sh
bun add @sprout-convex/analytics
```

## Quick start

From your app's root (a Convex + Expo project with `npx convex dev` already
set up):

```sh
bunx sprout init
```

This mounts the component, generates a write key and dashboard key, wires the
ingest HTTP route and a registration mutation, adds `initSprout` +
`useSproutScreenTracking` to your root layout, and offers to run the Convex
side effects (`convex env set SPROUT_DASHBOARD_KEY`, `convex run
sproutSetup:register`) for you. Anything it can't wire automatically it
prints as a snippet instead.

What it generates, for reference:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import sprout from "@sprout-convex/analytics/convex.config";

const app = defineApp();
app.use(sprout);
export default app;
```

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { Sprout } from "@sprout-convex/analytics/client";

const http = httpRouter();
new Sprout(components.analytics).registerRoutes(http); // POST /sprout/ingest
export default http;
```

```ts
// convex/sproutSetup.ts — one-time registration, run via
// `npx convex run sproutSetup:register '{"writeKey":"..."}'`
import { internalMutation } from "./_generated/server";
import { Sprout } from "@sprout-convex/analytics/client";
import { components } from "./_generated/api";

const sprout = new Sprout(components.analytics);

export const register = internalMutation({
  /* ... */
  handler: async (ctx, { writeKey }) =>
    sprout.createApp(ctx, { slug: "my-app", name: "My App", writeKey }),
});
```

```tsx
// app/_layout.tsx
import { initSprout } from "@sprout-convex/analytics";
import { useSproutScreenTracking } from "@sprout-convex/analytics/hooks";

void initSprout({
  convexSiteUrl: process.env.EXPO_PUBLIC_CONVEX_SITE_URL!,
  writeKey: process.env.EXPO_PUBLIC_SPROUT_WRITE_KEY!,
});

export default function RootLayout() {
  useSproutScreenTracking(); // screen autocapture for expo-router
  // ...
}
```

```ts
import { track } from "@sprout-convex/analytics";

track("game_started", { level: 3 });
```

Once events are flowing, launch the dashboard from your app's root directory:

```sh
bunx sprout dashboard
```

## License

Apache-2.0
