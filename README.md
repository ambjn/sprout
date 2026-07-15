<div align="center">

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

[![license](https://img.shields.io/npm/l/@sprout-convex/analytics)](./LICENSE)

</div>

---

Monorepo for `@sprout-convex/analytics`: a [Convex component](https://www.convex.dev/components)
pairing an Expo SDK, a CLI, and a local dashboard, so analytics run entirely
inside your own Convex deployment.

## Layout

| Path | What it is |
|---|---|
| `packages/analytics` | The published package. Expo SDK (`track`/`screen`/`identify`/`captureException`), the Convex component, and the `sprout` CLI. |
| `apps/dashboard` | Source for the dashboard UI. Built at publish time and bundled into `packages/analytics/dist/dashboard`; not published on its own. |

## Sprout CLI

Once `@sprout-convex/analytics` is installed in an Expo + Convex app, `bunx sprout <command>` is available:

| Command | What it does |
|---|---|
| `sprout init` | Wires the component, ingest route, registration mutation, dashboard queries, and Expo root layout into an existing Convex + Expo app in one pass. |
| `sprout dashboard` | Serves the prebuilt dashboard UI against your Convex deployment on `http://127.0.0.1:4321`, opening it in your browser. |
| `sprout help` | Prints the command and flag summary shown above. |

Full setup guide, SDK usage, and dashboard flags live in
[`packages/analytics/README.md`](./packages/analytics/README.md).

## Monorepo commands

Run from the repo root:

```sh
bun run build       # builds packages/analytics: SDK, CLI, and the bundled dashboard
bun run test        # bun test across the monorepo
bun run typecheck   # typechecks every workspace package
```

Kept in sync by hand with [`packages/analytics/README.md`](./packages/analytics/README.md)
(the source of truth for the published package); the section below is what
convex.dev/components scrapes from the repo root, so it's mirrored here in
full.

<!-- START: Include on https://convex.dev/components -->

[![npm](https://img.shields.io/npm/v/@sprout-convex/analytics)](https://www.npmjs.com/package/@sprout-convex/analytics)
[![license](https://img.shields.io/npm/l/@sprout-convex/analytics)](./LICENSE)

Insights on how your React Native Expo app is used, with none of the infra.

- No ingestion service to run
- No database to provision
- No SLA to babysit

It's one [Convex component](https://www.convex.dev/components): session and
screen tracking, custom events, and error tracking with fingerprinted issues,
breadcrumbs, and stack traces — all running inside your own Convex
deployment, so your data never leaves it.

> **Status: 1.0.** The SDK, Convex component, CLI, and dashboard are all
> implemented and work end-to-end. This is the first stable release.

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

## Requirements

- An existing Expo app with [Convex](https://www.convex.dev) already set up
  (`npx convex dev` working).
- `expo-router`, for screen autocapture (everything else still works
  without it; you'd just call `screen()` manually).
- `expo-device`, `expo-constants`, and
  `@react-native-async-storage/async-storage`, all peer dependencies already
  present in a standard Expo app.

## Install

```sh
bun add @sprout-convex/analytics
```

## Quick start

From your app's root (a Convex + Expo project with `bunx convex dev` already
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

<details>
<summary>What it generates, for reference</summary>

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
// `bunx convex run sproutSetup:register '{"writeKey":"..."}'`
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

</details>

## Usage

All four calls below are fire-and-forget (no `await`) and queue onto the
same offline-durable buffer `initSprout` sets up: batched, retried with
exactly-once ingest, nothing lost across app kills or dropped connectivity.
Property values are restricted to the exported `PropertyValue` type
(`string | number | boolean | null`), so keep them flat (no nested
objects/arrays).

### `track`: custom events

```tsx
import { track } from "@sprout-convex/analytics";

const UpgradeButton = ({ planId }: { planId: string }) => (
  <Pressable
    onPress={() => {
      track("upgrade_tapped", { planId, source: "settings" });
      router.push("/upgrade");
    }}
  >
    <Text>Upgrade</Text>
  </Pressable>
);
```

### `screen`: manual screen views

`useSproutScreenTracking()` in your root layout already autocaptures
expo-router navigation, so most apps never call this directly. Reach for it
when a "view" doesn't correspond to a route change: a modal, a step in a
wizard, a tab inside a single screen.

```tsx
import { screen } from "@sprout-convex/analytics";

const OnboardingWizard = () => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    screen(`onboarding/step-${step}`, { totalSteps: 4 });
  }, [step]);

  // ...
};
```

### `identify`: associate events with a user

Call this once you know who the user is (after login, or on app start if
they're already signed in) so their events and issues are attributable
across sessions and devices:

```tsx
import { identify } from "@sprout-convex/analytics";

const handleLogin = async (email: string, password: string) => {
  const user = await signIn(email, password);
  identify(user.id, { plan: user.plan, email: user.email });
  router.replace("/");
};
```

### `captureException`: report a caught error

Uncaught JS errors and fatal exceptions are captured automatically once
`initSprout()` has run. Use `captureException` for errors your own code
already catches and swallows, so they still show up as an issue:

```tsx
import { captureException } from "@sprout-convex/analytics";

const loadProfile = async (userId: string) => {
  try {
    return await api.getProfile(userId);
  } catch (error) {
    captureException(error, { properties: { userId, screen: "profile" } });
    return null; // fall back gracefully, but don't lose visibility into why
  }
};
```

It also composes with a React error boundary:

```tsx
import { captureException } from "@sprout-convex/analytics";

class ScreenErrorBoundary extends React.Component<Props, State> {
  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    captureException(error, { properties: { componentStack: info.componentStack } });
  }
  // ...
}
```

### Advanced: `getSprout` / `shutdownSprout`

```tsx
import { getSprout, shutdownSprout } from "@sprout-convex/analytics";

const handleLogout = () => {
  shutdownSprout();
  signOut();
};
```

- **`getSprout()`** returns the underlying `SproutCore` instance, or `null`
  before `initSprout` resolves. An escape hatch for cases the top-level
  `track`/`screen`/`identify`/`captureException` calls don't cover.
- **`shutdownSprout()`** stops the flush timer and unhooks `AppState`/error
  listeners, useful on logout or account switch. The on-device queue isn't
  cleared, so a later `initSprout()` picks up right where it left off.

## Configuration

Options accepted by `initSprout`:

| Option | Default | Description |
|---|---|---|
| `convexSiteUrl` | *(required, unless `ingestUrl` set)* | Your Convex deployment's site URL (`https://<deployment>.convex.site`). Ingest path defaults to `/sprout/ingest`. |
| `ingestUrl` | derived from `convexSiteUrl` | Full ingest URL, for overriding the default path. |
| `writeKey` | *(required)* | The key generated by `sprout init`, from `EXPO_PUBLIC_SPROUT_WRITE_KEY`. |
| `storage` | `AsyncStorage` | Custom queue persistence; must implement `getItem`/`setItem`. |
| `flushIntervalMs` | `10_000` | How often the queue flushes to the ingest endpoint. |
| `maxBatchSize` | `50` | Max events sent per flush. |
| `maxQueueSize` | `500` | Oldest events are dropped past this, to bound on-device storage. |
| `sessionTimeoutMs` | `1_800_000` (30 min) | Foreground gap after which a new session starts. |
| `onInternalError` | none | Called on SDK-internal failures (storage, serialization, dropped batches); never thrown into your app. |

## Dashboard

```sh
bunx sprout dashboard
```

Run this from your app's root (same directory as `.env`/`.env.local`) so it
can find `EXPO_PUBLIC_CONVEX_URL`. It reads `SPROUT_SLUG` and
`SPROUT_DASHBOARD_KEY` from the shell environment, or prompts for them if
they're missing, then serves a prebuilt dashboard UI on `http://127.0.0.1:4321`
and opens it in your browser.

| Flag | Default | Description |
|---|---|---|
| `--port` | `4321` | Port to serve on. |
| `--host` | `127.0.0.1` | Bind address. Anything other than localhost prompts a confirmation first, since there's no per-user auth, only the shared dashboard key. |
| `--convex-url <url>` | discovered from `.env`/`.env.local` | Overrides `EXPO_PUBLIC_CONVEX_URL` discovery. |
| `--slug <slug>` | `SPROUT_SLUG` env var, or prompted | App slug registered with Sprout. |
| `--dashboard-key <key>` | `SPROUT_DASHBOARD_KEY` env var, or prompted | Must match what `npx convex env set SPROUT_DASHBOARD_KEY` stored on your deployment. |
| `--no-open` | opens automatically | Skip auto-opening a browser tab. |

If it can't reach your deployment (misconfigured key, nothing registered
yet), it falls back to a clearly-labeled sample dataset instead of erroring,
so you can still see what the dashboard looks like before wiring up real
data.

**Keep this on localhost.** `SPROUT_DASHBOARD_KEY` ships to the browser
bundle under this model, so treat it like a database console for your
analytics, not something to deploy publicly.

## Rate limiting & kill switch

Re-run registration any time to change an app's ingest settings, without
touching existing data:

```sh
npx convex run sproutSetup:register '{"writeKey":"<existing write key>","ingestEnabled":false}'
```

- `ingestEnabled: false` shuts off ingest immediately (e.g. a leaked write
  key). The server returns 403; the SDK backs off and keeps events queued
  on-device rather than dropping them, so turning ingest back on later
  resumes delivery instead of losing data.
- `maxEventsPerHour: <n>` caps ingest volume; requests past the cap get 429
  and are handled the same way (queued, backed off, retried).

Both are optional and additive to the one-time call from
[Quick start](#quick-start).

<!-- END: Include on https://convex.dev/components -->

Full package README (same content, kept as the package's own docs page on
npm): [`packages/analytics/README.md`](./packages/analytics/README.md).

## License

Apache-2.0
