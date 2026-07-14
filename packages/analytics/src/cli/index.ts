#!/usr/bin/env node
import chalk from "chalk";
import { runDashboard } from "./dashboard.js";
import { runInit } from "./init.js";

const BANNER = chalk.green(`
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
~                                          ~
~                                _         ~
~      ___ _ __  _ __ ___  _   _| |_       ~
~     / __| '_ \\| '__/ _ \\| | | | __|      ~
~     \\__ \\ |_) | | | (_) | |_| | |_       ~
~     |___/ .__/|_|  \\___/ \\__,_|\\__|      ~
~         |_|                              ~
~                                          ~
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
`);

const USAGE = [
  chalk.dim("insights on how your app is used, with none of the infra."),
  chalk.dim("no ingestion service · no database · no SLA to babysit — just your Convex deployment."),
  "",
  chalk.cyan.bold("USAGE"),
  `  ${chalk.green("sprout")} ${chalk.yellow("<command>")} ${chalk.dim("[options]")}`,
  "",
  chalk.cyan.bold("COMMANDS"),
  `  ${chalk.green("init".padEnd(12))}${chalk.white("Hook Sprout into this app: Convex config, ingest route, keys, the whole setup")}`,
  `  ${chalk.green("dashboard".padEnd(12))}${chalk.white("Spin up the local analytics dashboard for your Convex deployment")}`,
  `  ${chalk.green("help".padEnd(12))}${chalk.white("You're looking at it")}`,
  "",
  chalk.cyan.bold("OPTIONS") + chalk.dim(" (dashboard)"),
  `  ${chalk.yellow("--convex-url <url>".padEnd(25))}${chalk.white("Convex deployment URL")} ${chalk.dim("(default: detected from EXPO_PUBLIC_CONVEX_URL)")}`,
  `  ${chalk.yellow("--slug <slug>".padEnd(25))}${chalk.white("App slug registered with Sprout")}`,
  `  ${chalk.yellow("--dashboard-key <key>".padEnd(25))}${chalk.white("SPROUT_DASHBOARD_KEY value")} ${chalk.dim("(npx convex env get SPROUT_DASHBOARD_KEY)")}`,
  `  ${chalk.yellow("--port <port>".padEnd(25))}${chalk.white("Local port")} ${chalk.dim("(default: 4321)")}`,
  `  ${chalk.yellow("--host <host>".padEnd(25))}${chalk.white("Local host")} ${chalk.dim("(default: 127.0.0.1)")}`,
  `  ${chalk.yellow("--no-open".padEnd(25))}${chalk.white("Keep the browser closed (no auto-open)")}`,
  "",
].join("\n");

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  switch (command) {
    case "init":
      console.log(BANNER);
      await runInit();
      break;
    case "dashboard":
      await runDashboard(rest);
      break;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(BANNER);
      console.log(USAGE);
      break;
    default:
      console.error(chalk.red(`✖ ${chalk.bold(command)} is not a command. Here's what is:\n`));
      console.log(USAGE);
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(chalk.red(error instanceof Error ? error.message : error));
  process.exitCode = 1;
});
