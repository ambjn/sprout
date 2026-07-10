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
    expect(stdout).toContain("Usage: sprout");
  });

  test("unknown command exits 1", () => {
    const { exitCode, stderr } = runCli("bogus");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unknown command: bogus");
  });
});
