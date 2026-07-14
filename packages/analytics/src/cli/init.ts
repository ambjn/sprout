import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { createInterface, type Interface } from "node:readline";
import chalk from "chalk";

// ---------------------------------------------------------------------------
// Prompt helpers. One shared readline interface for the whole run, with an
// explicit line queue: readline drops 'line' events that fire while no
// question is pending, which breaks piped/scripted stdin (answers arrive all
// at once). Queueing makes interactive and piped input behave the same;
// EOF resolves remaining prompts to their defaults.
// ---------------------------------------------------------------------------

let rl: Interface | null = null;
const lineQueue: string[] = [];
let lineWaiter: ((line: string | null) => void) | null = null;
let stdinClosed = false;

function getRl(): Interface {
  if (!rl) {
    rl = createInterface({ input: process.stdin });
    rl.on("line", (line) => {
      if (lineWaiter) {
        const waiter = lineWaiter;
        lineWaiter = null;
        waiter(line);
      } else {
        lineQueue.push(line);
      }
    });
    rl.on("close", () => {
      stdinClosed = true;
      if (lineWaiter) {
        const waiter = lineWaiter;
        lineWaiter = null;
        waiter(null);
      }
    });
  }
  return rl;
}

function closePrompts(): void {
  rl?.close();
  rl = null;
}

async function nextLine(): Promise<string | null> {
  getRl();
  if (lineQueue.length > 0) return lineQueue.shift()!;
  if (stdinClosed) return null;
  return new Promise((resolve) => {
    lineWaiter = resolve;
  });
}

async function prompt(question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` ${chalk.dim(`(${defaultValue})`)}` : "";
  process.stdout.write(`${chalk.cyan(question)}${suffix}: `);
  const line = await nextLine();
  if (line === null) process.stdout.write("\n");
  const answer = (line ?? "").trim();
  return answer || defaultValue || "";
}

async function confirm(question: string): Promise<boolean> {
  process.stdout.write(`${chalk.cyan(question)} ${chalk.dim("(y/N)")} `);
  const line = await nextLine();
  if (line === null) process.stdout.write("\n");
  const answer = (line ?? "").trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

// ---------------------------------------------------------------------------
// Small file helpers.
// ---------------------------------------------------------------------------

function readEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Insert `insert` after the last top-level `import ...` line. */
function insertAfterImports(source: string, insert: string): string {
  const lines = source.split("\n");
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import[\s{"']/.test(lines[i])) lastImport = i;
  }
  lines.splice(lastImport + 1, 0, insert);
  return lines.join("\n");
}

type Action = "created" | "patched" | "skipped (already wired)" | "skipped (see snippet above)";

// ---------------------------------------------------------------------------
// Templates: same content as a hand-wired host app (see STEPS.md),
// parameterized by slug/name. The component mounts as `components.analytics`
// (defineComponent("analytics")); the `as any` casts are only needed while
// the package is linked via a local `file:` dependency (duplicate `convex`
// copies make the generated types nominally distinct) and are omitted once
// it resolves from npm.
// ---------------------------------------------------------------------------

/** `name` itself, or `(name as any)` when a local `file:` link needs the escape hatch. */
function castRef(name: string, needsCast: boolean): string {
  return needsCast ? `(${name} as any)` : name;
}

function convexConfigTemplate(needsCast: boolean): string {
  return `import { defineApp } from "convex/server";
import sprout from "@sprout-convex/analytics/convex.config";

const app = defineApp();
app.use(${castRef("sprout", needsCast)});

export default app;
`;
}

function sproutSetupTemplate(slug: string, name: string, needsCast: boolean): string {
  return `import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { Sprout } from "@sprout-convex/analytics/client";

const sprout = new Sprout(${castRef("components", needsCast)}.analytics);

/**
 * One-time app registration, idempotent by slug. Run once via:
 *   npx convex run sproutSetup:register '{"writeKey":"<generate a random secret>"}'
 * Then put the same value in EXPO_PUBLIC_SPROUT_WRITE_KEY.
 *
 * Re-run with \`ingestEnabled: false\` to shut off a leaked/spamming write key,
 * or with \`maxEventsPerHour\` to cap ingest volume (429s past the cap).
 */
export const register = internalMutation({
  args: {
    writeKey: v.string(),
    ingestEnabled: v.optional(v.boolean()),
    maxEventsPerHour: v.optional(v.number()),
  },
  handler: async (ctx, { writeKey, ingestEnabled, maxEventsPerHour }) => {
    return await sprout.createApp(ctx, {
      slug: ${JSON.stringify(slug)},
      name: ${JSON.stringify(name)},
      writeKey,
      ingestEnabled,
      maxEventsPerHour,
    });
  },
});
`;
}

function sproutQueriesTemplate(slug: string, needsCast: boolean): string {
  return `import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { Sprout } from "@sprout-convex/analytics/client";

const sprout = new Sprout(${castRef("components", needsCast)}.analytics);

const SLUG = ${JSON.stringify(slug)};

/**
 * Public read surface for the Sprout dashboard. Gated by a shared secret
 * (not real per-user auth) since this is a basic, internal, self-hosted
 * dashboard -- do not point it at anything more sensitive without adding
 * real auth first.
 */
function requireDashboardKey(dashboardKey: string) {
  const expected = process.env.SPROUT_DASHBOARD_KEY;
  if (!expected || dashboardKey !== expected) {
    throw new Error("Unauthorized");
  }
}

export const overview = query({
  args: {
    dashboardKey: v.string(),
    from: v.number(),
    to: v.number(),
    interval: v.union(v.literal("hour"), v.literal("day")),
  },
  handler: async (ctx, { dashboardKey, from, to, interval }) => {
    requireDashboardKey(dashboardKey);
    return await sprout.overview(ctx, { slug: SLUG, from, to, interval });
  },
});

export const sessions = query({
  args: { dashboardKey: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { dashboardKey, limit }) => {
    requireDashboardKey(dashboardKey);
    return await sprout.sessions(ctx, { slug: SLUG, limit });
  },
});

export const issues = query({
  args: {
    dashboardKey: v.string(),
    status: v.optional(
      v.union(v.literal("open"), v.literal("resolved"), v.literal("ignored")),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { dashboardKey, status, limit }) => {
    requireDashboardKey(dashboardKey);
    return await sprout.issues(ctx, { slug: SLUG, status, limit });
  },
});

export const issueDetail = query({
  args: {
    dashboardKey: v.string(),
    fingerprint: v.string(),
    eventLimit: v.optional(v.number()),
  },
  handler: async (ctx, { dashboardKey, fingerprint, eventLimit }) => {
    requireDashboardKey(dashboardKey);
    return await sprout.issueDetail(ctx, { slug: SLUG, fingerprint, eventLimit });
  },
});

export const setIssueStatus = mutation({
  args: {
    dashboardKey: v.string(),
    fingerprint: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("resolved"),
      v.literal("ignored"),
    ),
  },
  handler: async (ctx, { dashboardKey, fingerprint, status }) => {
    requireDashboardKey(dashboardKey);
    return await sprout.setIssueStatus(ctx, { slug: SLUG, fingerprint, status });
  },
});
`;
}

function httpTemplate(needsCast: boolean): string {
  return `import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { Sprout } from "@sprout-convex/analytics/client";

const http = httpRouter();

// Mounts POST /sprout/ingest for the Expo SDK to send events to.
new Sprout(${castRef("components", needsCast)}.analytics).registerRoutes(http);

export default http;
`;
}

const LAYOUT_SNIPPET = `import { initSprout } from "@sprout-convex/analytics";
import { useSproutScreenTracking } from "@sprout-convex/analytics/hooks";

// Module scope, near your ConvexReactClient construction:
void initSprout({
  convexSiteUrl: process.env.EXPO_PUBLIC_CONVEX_SITE_URL!,
  writeKey: process.env.EXPO_PUBLIC_SPROUT_WRITE_KEY!,
});

// Inside your root component:
useSproutScreenTracking();
`;

const METRO_SNIPPET = `// @sprout-convex/analytics is linked via a local \`file:\` dependency, which has
// its own nested copies of react-native/expo-*/async-storage. Force Metro to
// resolve these singleton-sensitive packages from the app's node_modules so
// only one instance of each exists (otherwise: TurboModuleRegistry errors).
const path = require("path");
const forcedToHostNodeModules = new Set([
  "react",
  "react-native",
  "expo-router",
  "expo-constants",
  "expo-device",
  "@react-native-async-storage/async-storage",
  "convex",
]);
const hostOrigin = path.join(__dirname, "metro.config.js");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const bareName = moduleName.startsWith("@")
    ? moduleName.split("/").slice(0, 2).join("/")
    : moduleName.split("/")[0];
  const originModulePath = forcedToHostNodeModules.has(bareName)
    ? hostOrigin
    : context.originModulePath;
  return context.resolveRequest(
    { ...context, originModulePath },
    moduleName,
    platform,
  );
};
`;

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

export async function runInit(): Promise<void> {
  const cwd = process.cwd();
  const summary: Array<[string, Action]> = [];
  const notes: string[] = [];

  try {
    // 1. Detect project shape.
    const convexDir = path.join(cwd, "convex");
    if (!existsSync(convexDir)) {
      console.error(
        chalk.red("✖ No convex/ directory here, nothing to hook into.") +
          `\n  Get Convex going first ${chalk.dim("(npx convex dev)")}, then re-run ${chalk.green("sprout init")} from your app's root.`,
      );
      process.exitCode = 1;
      return;
    }

    const pkg = existsSync(path.join(cwd, "package.json"))
      ? JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"))
      : {};
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const isExpo = Boolean(deps?.expo) || existsSync(path.join(cwd, "app.json"));
    const sproutDep = deps?.["@sprout-convex/analytics"];
    const needsCast = typeof sproutDep === "string" && sproutDep.startsWith("file:");

    // 2. Slug/name, defaulted from package.json.
    const defaultSlug = (pkg.name ?? "my-app")
      .replace(/^@[^/]+\//, "")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const slug = await prompt("App slug", defaultSlug);
    const defaultName = slug.charAt(0).toUpperCase() + slug.slice(1);
    const name = await prompt("App name", defaultName);

    // 3. Secrets. Reuse an existing write key from .env/.env.local; otherwise
    //    generate. Never print into files the user didn't ask for.
    const env = {
      ...readEnvFile(path.join(cwd, ".env")),
      ...readEnvFile(path.join(cwd, ".env.local")),
    };
    const writeKey = await prompt(
      "Write key",
      env.EXPO_PUBLIC_SPROUT_WRITE_KEY ?? randomBytes(16).toString("hex"),
    );
    const dashboardKey = await prompt("Dashboard key", randomBytes(16).toString("hex"));

    console.log("");

    // 4. convex/convex.config.ts
    const configPath = path.join(convexDir, "convex.config.ts");
    if (!existsSync(configPath)) {
      writeFileSync(configPath, convexConfigTemplate(needsCast));
      summary.push(["convex/convex.config.ts", "created"]);
    } else {
      const source = readFileSync(configPath, "utf8");
      if (source.includes("@sprout-convex/analytics/convex.config")) {
        summary.push(["convex/convex.config.ts", "skipped (already wired)"]);
      } else if (/^export default app;?\s*$/m.test(source)) {
        let patched = insertAfterImports(
          source,
          'import sprout from "@sprout-convex/analytics/convex.config";',
        );
        patched = patched.replace(
          /^export default app;?\s*$/m,
          `app.use(${castRef("sprout", needsCast)});\n\nexport default app;`,
        );
        writeFileSync(configPath, patched);
        summary.push(["convex/convex.config.ts", "patched"]);
      } else {
        console.log(chalk.yellow("⚠ convex/convex.config.ts is doing its own thing. Add this yourself:\n"));
        console.log(chalk.dim('  import sprout from "@sprout-convex/analytics/convex.config";'));
        console.log(chalk.dim(`  app.use(${castRef("sprout", needsCast)});\n`));
        summary.push(["convex/convex.config.ts", "skipped (see snippet above)"]);
      }
    }

    // 5. convex/sproutSetup.ts + convex/sprout.ts
    for (const [file, content] of [
      ["sproutSetup.ts", sproutSetupTemplate(slug, name, needsCast)],
      ["sprout.ts", sproutQueriesTemplate(slug, needsCast)],
    ] as const) {
      const filePath = path.join(convexDir, file);
      if (!existsSync(filePath)) {
        writeFileSync(filePath, content);
        summary.push([`convex/${file}`, "created"]);
      } else if (readFileSync(filePath, "utf8").includes("@sprout-convex/analytics/client")) {
        summary.push([`convex/${file}`, "skipped (already wired)"]);
      } else {
        console.log(chalk.yellow(`⚠ convex/${file} already exists and isn't Sprout's. Not touching it.\n`));
        summary.push([`convex/${file}`, "skipped (see snippet above)"]);
      }
    }

    // 6. convex/http.ts
    const httpPath = path.join(convexDir, "http.ts");
    if (!existsSync(httpPath)) {
      writeFileSync(httpPath, httpTemplate(needsCast));
      summary.push(["convex/http.ts", "created"]);
    } else {
      const source = readFileSync(httpPath, "utf8");
      if (source.includes("@sprout-convex/analytics")) {
        summary.push(["convex/http.ts", "skipped (already wired)"]);
      } else if (/const http = httpRouter\(\);?/.test(source)) {
        // Alias the _generated import so we never collide with an existing
        // `components` binding in the host's http.ts.
        let patched = insertAfterImports(
          source,
          'import { components as sproutComponents } from "./_generated/api";\n' +
            'import { Sprout } from "@sprout-convex/analytics/client";',
        );
        patched = patched.replace(
          /const http = httpRouter\(\);?/,
          "const http = httpRouter();\n\n" +
            "// Mounts POST /sprout/ingest for the Expo SDK to send events to.\n" +
            `new Sprout(${castRef("sproutComponents", needsCast)}.analytics).registerRoutes(http);`,
        );
        writeFileSync(httpPath, patched);
        summary.push(["convex/http.ts", "patched"]);
      } else {
        console.log(chalk.yellow("⚠ convex/http.ts is doing its own thing. Add this yourself:\n"));
        console.log(chalk.dim('  import { components } from "./_generated/api";'));
        console.log(chalk.dim('  import { Sprout } from "@sprout-convex/analytics/client";'));
        console.log(
          chalk.dim(`  new Sprout(${castRef("components", needsCast)}.analytics).registerRoutes(http);\n`),
        );
        summary.push(["convex/http.ts", "skipped (see snippet above)"]);
      }
    }

    // 7. .env / .env.local: append, never overwrite.
    const envTarget = existsSync(path.join(cwd, ".env"))
      ? path.join(cwd, ".env")
      : path.join(cwd, ".env.local");
    if (!env.EXPO_PUBLIC_SPROUT_WRITE_KEY) {
      appendFileSync(envTarget, `\nEXPO_PUBLIC_SPROUT_WRITE_KEY=${writeKey}\n`);
      summary.push([`${path.basename(envTarget)} (EXPO_PUBLIC_SPROUT_WRITE_KEY)`, "patched"]);
    } else {
      summary.push([`${path.basename(envTarget)} (EXPO_PUBLIC_SPROUT_WRITE_KEY)`, "skipped (already wired)"]);
    }
    if (!env.EXPO_PUBLIC_CONVEX_SITE_URL && env.EXPO_PUBLIC_CONVEX_URL?.endsWith(".convex.cloud")) {
      const siteUrl = env.EXPO_PUBLIC_CONVEX_URL.replace(/\.convex\.cloud$/, ".convex.site");
      appendFileSync(
        envTarget,
        `\n# Derived from EXPO_PUBLIC_CONVEX_URL; the Expo SDK posts events here.\nEXPO_PUBLIC_CONVEX_SITE_URL=${siteUrl}\n`,
      );
      summary.push([`${path.basename(envTarget)} (EXPO_PUBLIC_CONVEX_SITE_URL)`, "patched"]);
    } else if (!env.EXPO_PUBLIC_CONVEX_SITE_URL) {
      notes.push(
        "Set EXPO_PUBLIC_CONVEX_SITE_URL (https://<deployment>.convex.site) in your .env. The SDK posts events there.",
      );
    }

    // 8. Convex side effects, each behind a y/N prompt.
    console.log("");
    if (await confirm(`Run \`npx convex env set SPROUT_DASHBOARD_KEY ...\` now?`)) {
      const result = spawnSync("npx", ["convex", "env", "set", "SPROUT_DASHBOARD_KEY", dashboardKey], {
        stdio: "inherit",
      });
      if (result.status !== 0) notes.push("`convex env set SPROUT_DASHBOARD_KEY` didn't go through. Run it manually.");
    } else {
      notes.push(`Run: npx convex env set SPROUT_DASHBOARD_KEY ${dashboardKey}`);
    }

    if (
      await confirm(
        "Register the app now? (needs `npx convex dev` running in another terminal)",
      )
    ) {
      const result = spawnSync(
        "npx",
        ["convex", "run", "sproutSetup:register", JSON.stringify({ writeKey })],
        { stdio: "inherit" },
      );
      if (result.status !== 0) notes.push("`convex run sproutSetup:register` didn't go through. Run it manually once `convex dev` is up.");
    } else {
      notes.push(`Run once \`npx convex dev\` is up: npx convex run sproutSetup:register '{"writeKey":"${writeKey}"}'`);
    }

    // 9. Expo root-layout wiring (best effort, falls back to a snippet).
    if (isExpo) {
      const layoutPath = ["app/_layout.tsx", "src/app/_layout.tsx"]
        .map((p) => path.join(cwd, p))
        .find(existsSync);
      if (!layoutPath) {
        console.log(chalk.yellow("\n⚠ No app/_layout.tsx found. Wire the SDK up yourself:\n"));
        console.log(chalk.dim(LAYOUT_SNIPPET));
        summary.push(["root layout", "skipped (see snippet above)"]);
      } else {
        const source = readFileSync(layoutPath, "utf8");
        const rel = path.relative(cwd, layoutPath);
        if (source.includes("@sprout-convex/analytics")) {
          summary.push([rel, "skipped (already wired)"]);
        } else {
          // Conservative anchor: the ConvexReactClient construction statement.
          const lines = source.split("\n");
          const clientLine = lines.findIndex((l) => l.includes("new ConvexReactClient("));
          let statementEnd = clientLine;
          while (statementEnd !== -1 && statementEnd < lines.length && !/\);\s*$/.test(lines[statementEnd])) {
            statementEnd++;
          }
          const componentOpen = lines.findIndex((l) =>
            /export default function \w+\([^)]*\)\s*{\s*$/.test(l),
          );
          if (clientLine === -1 || statementEnd >= lines.length || componentOpen === -1) {
            console.log(chalk.yellow(`\n⚠ Couldn't find a safe spot in ${rel}. Wire the SDK up yourself:\n`));
            console.log(chalk.dim(LAYOUT_SNIPPET));
            summary.push([rel, "skipped (see snippet above)"]);
          } else {
            lines.splice(
              statementEnd + 1,
              0,
              "",
              "void initSprout({",
              "  convexSiteUrl: process.env.EXPO_PUBLIC_CONVEX_SITE_URL!,",
              "  writeKey: process.env.EXPO_PUBLIC_SPROUT_WRITE_KEY!,",
              "});",
            );
            lines.splice(componentOpen + (componentOpen < clientLine ? 0 : 5) + 1, 0, "  useSproutScreenTracking();");
            const patched = insertAfterImports(
              lines.join("\n"),
              'import { initSprout } from "@sprout-convex/analytics";\n' +
                'import { useSproutScreenTracking } from "@sprout-convex/analytics/hooks";',
            );
            writeFileSync(layoutPath, patched);
            summary.push([rel, "patched"]);
          }
        }
      }

      // 10. Metro override: only relevant while linked via file:.
      if (needsCast) {
        const metroPath = path.join(cwd, "metro.config.js");
        const metroSource = existsSync(metroPath) ? readFileSync(metroPath, "utf8") : "";
        if (metroSource.includes("resolveRequest")) {
          summary.push(["metro.config.js", "skipped (already wired)"]);
        } else {
          console.log(
            chalk.yellow("\n⚠ @sprout-convex/analytics is linked via file:, which needs a metro.config.js"),
          );
          console.log(chalk.yellow("  resolveRequest override to avoid duplicate react-native instances."));
          const anchor = /const config = getDefaultConfig\(__dirname\);?/;
          if (metroSource && anchor.test(metroSource) && (await confirm("  Insert it now?"))) {
            writeFileSync(metroPath, metroSource.replace(anchor, (m) => `${m}\n\n${METRO_SNIPPET}`));
            summary.push(["metro.config.js", "patched"]);
          } else {
            console.log(`\n  Add this after ${chalk.green("const config = getDefaultConfig(__dirname);")}:\n`);
            console.log(chalk.dim(METRO_SNIPPET));
            summary.push(["metro.config.js", "skipped (see snippet above)"]);
          }
        }
      }
    }

    // 11. Final summary.
    console.log("");
    for (const [file, action] of summary) {
      const done = action === "created" || action === "patched";
      const mark = done ? chalk.green("✔") : chalk.dim("•");
      const label = done ? chalk.white(file) : chalk.dim(file);
      console.log(`  ${mark}  ${label} ${chalk.dim(`· ${action}`)}`);
    }
    if (notes.length > 0) {
      console.log(chalk.yellow.bold("\nSTILL TO DO"));
      for (const note of notes) console.log(`  ${chalk.yellow("-")} ${chalk.white(note)}`);
    }
    console.log(chalk.cyan.bold("\nNEXT STEPS"));
    if (isExpo) console.log(`  ${chalk.cyan("-")} Restart with a clear cache: ${chalk.green("npx expo start -c")}`);
    console.log(`  ${chalk.cyan("-")} Once events start flowing, check them out: ${chalk.green("sprout dashboard")}`);
    console.log("");
  } finally {
    closePrompts();
  }
}
