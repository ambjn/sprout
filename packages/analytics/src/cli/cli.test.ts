import { describe, expect, test } from "bun:test";

const CLI = new URL("./index.ts", import.meta.url).pathname;

function runCli(...args: string[]) {
  const result = Bun.spawnSync(["bun", CLI, ...args]);
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

describe("sprout CLI", () => {
  test("help prints usage and exits 0", () => {
    const { exitCode, stdout } = runCli("help");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("USAGE");
    expect(stdout).toContain("dashboard");
    expect(stdout).toContain("init");
  });

  test("unknown command exits 1", () => {
    const { exitCode, stderr } = runCli("bogus");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("bogus is not a command");
  });

  test("dashboard without assets or convex url exits 1", () => {
    // Run from a cwd with no .env and without a built dist/dashboard: the
    // command must fail cleanly rather than hang on a prompt.
    const result = Bun.spawnSync(["bun", CLI, "dashboard", "--no-open"], {
      cwd: "/private/tmp",
      env: { ...process.env, EXPO_PUBLIC_CONVEX_URL: "" },
    });
    expect(result.exitCode).toBe(1);
  });
});
