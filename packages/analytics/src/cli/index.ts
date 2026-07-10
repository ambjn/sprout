#!/usr/bin/env node
// sprout CLI entry point.

const [, , command] = process.argv;

switch (command) {
  case undefined:
  case "help":
  case "--help":
    console.log("Usage: sprout <command>\n\nCommands:\n  dash   Serve the insights dashboard locally");
    break;
  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}
