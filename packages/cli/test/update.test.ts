import { expect, test } from "bun:test";
import { assetName, compareSemver, keepaliveFor, parseSemver } from "../src/cmd/update.ts";

test("semver", () => {
  expect(parseSemver("v0.4.1")).toEqual([0, 4, 1]);
  expect(parseSemver("0.10.0")).toEqual([0, 10, 0]);
  expect(parseSemver("dev")).toBeUndefined();
  expect(parseSemver("v0.3.0-3-gabc")).toBeUndefined();
  expect(compareSemver([0, 10, 0], [0, 9, 9])).toBeGreaterThan(0);
  expect(compareSemver([0, 4, 0], [0, 4, 0])).toBe(0);
  expect(compareSemver([1, 0, 0], [0, 99, 99])).toBeGreaterThan(0);
  expect(compareSemver([0, 5, 2], [0, 5, 3])).toBeLessThan(0);
});

test("asset names match release files", () => {
  expect(assetName("linux", "x64", false)).toBe("wx-bot_linux_amd64");
  expect(assetName("linux", "arm64", true)).toBe("wx-bot_linux_arm64_musl");
  expect(assetName("darwin", "arm64", true)).toBe("wx-bot_darwin_arm64");
  expect(assetName("darwin", "x64", false)).toBe("wx-bot_darwin_amd64");
});

test("keepalive default binary path follows the install location", () => {
  const script = 'WXBOT="${WXBOT:-$HOME/.local/bin/wx-bot}"\n';
  expect(keepaliveFor(script, "/usr/local/bin/wx-bot")).toBe('WXBOT="${WXBOT:-/usr/local/bin/wx-bot}"\n');
});

// Isolate the module's environment lookup in a child process. Fetch is fake;
// these tests never contact GitHub, replace a binary or restart a service.
function update(current: string, latest: string, args: string[], releaseBase?: string) {
  const env = { ...process.env };
  delete env.WXBOT_RELEASE_BASE;
  if (releaseBase !== undefined) env.WXBOT_RELEASE_BASE = releaseBase;
  const module = new URL("../src/cmd/update.ts", import.meta.url).href;
  const child = Bun.spawnSync([process.execPath, "--eval", `
    const calls = [], logs = [], errors = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), redirect: options?.redirect });
      return new Response(null, { status: 302, headers: { location: "https://example.test/tag/${latest}" } });
    };
    console.log = (...args) => logs.push(args.join(" "));
    console.error = (...args) => errors.push(args.join(" "));
    const { cmdUpdate } = await import(${JSON.stringify(module)});
    const code = await cmdUpdate(${JSON.stringify(current)}, ${JSON.stringify(args)});
    process.stdout.write(JSON.stringify({ code, calls, logs, errors }));
  `], { env });
  expect(child.exitCode).toBe(0);
  return JSON.parse(child.stdout.toString()) as {
    code: number; calls: { url: string; redirect: string }[]; logs: string[]; errors: string[];
  };
}

test("update --check defaults to fork releases", () => {
  const result = update("v0.5.2", "v0.5.3", ["--check"]);
  expect(result.code).toBe(0);
  expect(result.calls).toEqual([{ url: "https://github.com/hongpeiqin/wx-bot/releases/latest", redirect: "manual" }]);
  expect(result.logs.join("\n")).toContain("update available: v0.5.2 -> v0.5.3");
});

test("WXBOT_RELEASE_BASE still overrides the fork default", () => {
  const result = update("v0.5.3", "v0.10.0", ["--check"], "https://mirror.example.test/wx/releases");
  expect(result.code).toBe(0);
  expect(result.calls[0]?.url).toBe("https://mirror.example.test/wx/releases/latest");
  expect(result.logs.join("\n")).toContain("update available: v0.5.3 -> v0.10.0");
});

for (const latest of ["v0.5.3", "v0.5.2"]) {
  test(`latest ${latest} does not reinstall or downgrade v0.5.3`, () => {
    const result = update("v0.5.3", latest, ["--no-restart"]);
    expect(result.code).toBe(0);
    expect(result.calls).toHaveLength(1);
    expect(result.logs.join("\n")).toContain("is up to date");
    expect(result.errors).toEqual([]);
  });
}

test("an explicit version bypasses latest lookup, including rollback", () => {
  const result = update("v0.5.3", "v9.0.0", ["--version", "v0.5.2", "--no-restart"]);
  expect(result.calls).toEqual([]);
  // Source execution refuses replacement; reaching this guard shows the
  // explicitly requested older version was not skipped as 'up to date'.
  expect(result.code).toBe(1);
  expect(result.errors.join("\n")).toContain("not an installed wx-bot binary");
});
