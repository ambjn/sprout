/**
 * Register this component with a `convex-test` instance, for testing a host
 * app's own Convex functions that call into Sprout.
 *
 * ```ts
 * import { convexTest } from "convex-test";
 * import schema from "./schema";
 * import sproutTest from "@sprout-convex/analytics/test";
 *
 * const t = convexTest(schema);
 * sproutTest.register(t); // mounts under "analytics", matching convex.config.ts
 * ```
 */
import type { TestConvex } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import schema from "./component/schema.js";

// Vite's `import.meta.glob` would build this map automatically, but this
// package builds with tsc for a plain Node/Bun runtime, so the component's
// modules are listed explicitly instead.
const modules: Record<string, () => Promise<unknown>> = {
  "./component/convex.config.ts": () => import("./component/convex.config.js"),
  "./component/constants.ts": () => import("./component/constants.js"),
  "./component/helpers.ts": () => import("./component/helpers.js"),
  "./component/public.ts": () => import("./component/public.js"),
  "./component/schema.ts": () => import("./component/schema.js"),
  "./component/_generated/api.ts": () => import("./component/_generated/api.js"),
  "./component/_generated/dataModel.ts": () => import("./component/_generated/dataModel.js"),
  "./component/_generated/server.ts": () => import("./component/_generated/server.js"),
};

export function register(
  t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
  name: string = "analytics",
): void {
  t.registerComponent(name, schema, modules);
}

export default { register, schema, modules };
