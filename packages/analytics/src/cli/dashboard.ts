import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { exec } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import chalk from "chalk";

// dist/cli/dashboard.js -> dist/dashboard (the prebuilt static SPA, see DASHBOARD.md)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = path.resolve(__dirname, "../dashboard");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

interface DashArgs {
  port: number;
  host: string;
  convexUrl?: string;
  slug?: string;
  dashboardKey?: string;
  open: boolean;
}

function parseArgs(argv: string[]): DashArgs {
  const args: DashArgs = { port: 4321, host: "127.0.0.1", open: true };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--port":
        args.port = Number(argv[++i]);
        break;
      case "--host":
        args.host = argv[++i];
        break;
      case "--convex-url":
        args.convexUrl = argv[++i];
        break;
      case "--slug":
        args.slug = argv[++i];
        break;
      case "--dashboard-key":
        args.dashboardKey = argv[++i];
        break;
      case "--no-open":
        args.open = false;
        break;
    }
  }
  return args;
}

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

// The Convex URL is the one value `init` already persists locally (as
// EXPO_PUBLIC_CONVEX_URL, written by `npx convex dev`), so it's the only one we can
// reliably discover without prompting. slug/dashboardKey have no local file today --
// dashboardKey is a server-side Convex env var by design (see STEPS.md), never
// written to disk on the host -- so those fall back to a prompt below.
function findConvexUrl(cwd: string): string | undefined {
  for (const name of [".env.local", ".env"]) {
    const value = readEnvFile(path.join(cwd, name)).EXPO_PUBLIC_CONVEX_URL;
    if (value) return value;
  }
  return process.env.EXPO_PUBLIC_CONVEX_URL;
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function confirm(question: string): Promise<boolean> {
  const answer = await prompt(`${question} (y/N) `);
  return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
}

async function openBrowser(url: string): Promise<void> {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${JSON.stringify(url)}`);
}

export async function runDashboard(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const cwd = process.cwd();

  if (!existsSync(DASHBOARD_DIR)) {
    console.error(
      chalk.red("✖ Dashboard assets are missing (no dist/dashboard).") +
        chalk.dim("\n  This @sprout-convex/analytics install is cooked. A reinstall should fix it."),
    );
    process.exitCode = 1;
    return;
  }

  const convexUrl = args.convexUrl ?? findConvexUrl(cwd);
  if (!convexUrl) {
    console.error(
      chalk.red("✖ No EXPO_PUBLIC_CONVEX_URL in .env / .env.local here, so we can't find your deployment.") +
        `\n  Run ${chalk.green("sprout dashboard")} from your app's root, or just pass ${chalk.yellow("--convex-url <url>")}.`,
    );
    process.exitCode = 1;
    return;
  }

  const slug =
    args.slug ?? process.env.SPROUT_SLUG ?? (await prompt(chalk.cyan("App slug registered with Sprout: ")));
  if (!slug) {
    console.error(
      chalk.red("✖ No slug provided.") +
        `\n  Pass ${chalk.yellow("--slug <slug>")} or set ${chalk.yellow("SPROUT_SLUG")}.`,
    );
    process.exitCode = 1;
    return;
  }

  const dashboardKey =
    args.dashboardKey ??
    process.env.SPROUT_DASHBOARD_KEY ??
    (await prompt(chalk.cyan("SPROUT_DASHBOARD_KEY ") + chalk.dim("(npx convex env get SPROUT_DASHBOARD_KEY)") + ": "));
  if (!dashboardKey) {
    console.error(
      chalk.red("✖ No dashboard key provided.") +
        `\n  Pass ${chalk.yellow("--dashboard-key <key>")} or set ${chalk.yellow("SPROUT_DASHBOARD_KEY")}.`,
    );
    process.exitCode = 1;
    return;
  }

  const isLocalHost = args.host === "127.0.0.1" || args.host === "localhost";
  if (!isLocalHost) {
    console.log("");
    console.log(chalk.yellow(`⚠  --host ${args.host} puts this dashboard out on the network, not just localhost.`));
    console.log(chalk.yellow("   Anyone who can reach that address can see SPROUT_DASHBOARD_KEY, and"));
    console.log(chalk.yellow("   there's no per-user auth here") + chalk.dim(" (see DASHBOARD.md)."));
    const proceed = await confirm("   Run it anyway?");
    if (!proceed) {
      console.log(chalk.green("Good call, nothing was exposed. ✌️"));
      return;
    }
  }

  const config = { convexUrl, slug, dashboardKey };
  const configScript = `<script>window.__SPROUT_CONFIG__=${JSON.stringify(config)};</script>`;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      let filePath = path.normalize(path.join(DASHBOARD_DIR, decodeURIComponent(url.pathname)));
      if (!filePath.startsWith(DASHBOARD_DIR)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      const isDirectory = existsSync(filePath) && (await stat(filePath)).isDirectory();
      if (url.pathname === "/" || !existsSync(filePath) || isDirectory) {
        filePath = path.join(DASHBOARD_DIR, "index.html");
      }

      const ext = path.extname(filePath);
      if (ext === ".html") {
        const html = await readFile(filePath, "utf8");
        res.writeHead(200, { "Content-Type": MIME_TYPES[ext] });
        res.end(html.replace("<!--SPROUT_CONFIG-->", configScript));
        return;
      }

      const body = await readFile(filePath);
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(args.port, args.host, resolve);
  });

  const url = `http://${args.host}:${args.port}`;
  console.log("");
  console.log(`  ${chalk.green("➜")}  ${chalk.white("Sprout dashboard is live at")} ${chalk.cyan.underline(url)}`);
  console.log("");
  console.log(chalk.yellow("  ⚠  Keep this on localhost. It's not built to be public."));
  console.log(chalk.dim("     SPROUT_DASHBOARD_KEY is visible in the browser under this model."));
  console.log("");

  if (args.open) {
    await openBrowser(url);
  }
}
