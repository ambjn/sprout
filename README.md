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

## License

Apache-2.0
