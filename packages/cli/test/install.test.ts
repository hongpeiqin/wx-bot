import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const installer = readFileSync(join(root, "install.sh"), "utf8");
const keepalive = readFileSync(join(root, "deploy/keepalive.sh"), "utf8");
const forkReleases = "https://github.com/hongpeiqin/wx-bot/releases";
const forkRaw = "https://raw.githubusercontent.com/hongpeiqin/wx-bot/main";

function sandbox(
  run: (dir: string, env: Record<string, string>, requests: () => string[]) => void,
  overrides: Record<string, string> = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "wx-install-"));
  try {
    for (const path of ["mockbin", "home", "tmp", "home/.config/wx-bot"]) mkdirSync(join(dir, path), { recursive: true });
    const script = '#!/bin/sh\ncase "$1" in version) echo "wx-bot v0.5.3" ;; health) exit 0 ;; *) exit 97 ;; esac\n';
    writeFileSync(join(dir, "wx-bot_darwin_arm64"), script);
    const hash = createHash("sha256").update(script).digest("hex");
    writeFileSync(join(dir, "checksums.txt"), `${hash}  wx-bot_darwin_arm64\n`);
    writeFileSync(join(dir, "keepalive.sh"), keepalive);
    writeFileSync(join(dir, "install.sh"), installer);
    writeFileSync(join(dir, "config.example.json"), '{"bindings": []}\n');
    writeFileSync(join(dir, "env.example"), "# fixture env\n");
    writeFileSync(join(dir, "home/.config/wx-bot/config.json"), "existing config\n");
    writeFileSync(join(dir, "home/.config/wx-bot/env"), "# existing env\n");
    // Ensure command -v wx-bot can only find a harmless fixture. No global
    // binary, service manager or real curl can be invoked by these tests.
    writeFileSync(join(dir, "mockbin/wx-bot"), script, { mode: 0o755 });
    for (const name of ["launchctl", "systemctl", "pgrep", "sudo"]) {
      writeFileSync(join(dir, "mockbin", name), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    }
    writeFileSync(join(dir, "mockbin/uname"), '#!/bin/sh\ncase "$1" in -s) echo Darwin ;; -m) echo arm64 ;; *) exit 97 ;; esac\n', { mode: 0o755 });
    writeFileSync(join(dir, "mockbin/curl"), `#!/bin/sh
set -eu
dest=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) dest="$2"; shift 2 ;;
    --retry) shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
printf '%s\\n' "$url" >> "$FIXTURE/requests"
case "$url" in
  "$EXPECTED_RELEASE/wx-bot_darwin_arm64") file=wx-bot_darwin_arm64 ;;
  "$EXPECTED_RELEASE/checksums.txt") file=checksums.txt ;;
  "$EXPECTED_RAW/deploy/keepalive.sh") file=keepalive.sh ;;
  "$EXPECTED_RAW/examples/config.example.json") file=config.example.json ;;
  "$EXPECTED_RAW/examples/env.example") file=env.example ;;
  "${forkRaw}/install.sh") file=install.sh ;;
  *) echo "unexpected URL: $url" >&2; exit 98 ;;
esac
if [ -n "$dest" ]; then cp "$FIXTURE/$file" "$dest"; else cat "$FIXTURE/$file"; fi
`, { mode: 0o755 });
    const env = {
      PATH: `${join(dir, "mockbin")}:/usr/bin:/bin:/usr/sbin:/sbin`,
      HOME: join(dir, "home"), TMPDIR: join(dir, "tmp"), FIXTURE: dir,
      EXPECTED_RELEASE: `${forkReleases}/latest/download`, EXPECTED_RAW: forkRaw,
      ...overrides,
    };
    run(dir, env, () => readFileSync(join(dir, "requests"), "utf8").trim().split("\n"));
    expect(readFileSync(join(env.HOME, ".config/wx-bot/config.json"), "utf8")).toBe("existing config\n");
    expect(readFileSync(join(env.HOME, ".config/wx-bot/env"), "utf8")).toBe("# existing env\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function install(dir: string, env: Record<string, string>, args: string[] = []) {
  const result = Bun.spawnSync(["/bin/bash", "-s", "--", "--release", "--prefix", join(dir, "prefix"), ...args], {
    env, stdin: Buffer.from(installer),
  });
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain(`WXBOT_RELEASE_BASE=${forkReleases} wx-bot update`);
  expect(readFileSync(join(dir, "prefix/bin/wx-bot-keepalive"), "utf8")).toContain(`${forkRaw}/install.sh`);
}

test("piped installer downloads latest binary and recovery helper from fork, preserving config", () => {
  sandbox((dir, env, requests) => {
    install(dir, env);
    expect(requests()).toEqual([
      `${forkReleases}/latest/download/wx-bot_darwin_arm64`,
      `${forkReleases}/latest/download/checksums.txt`,
      `${forkRaw}/deploy/keepalive.sh`,
    ]);
  });
});

test("installer --version selects the requested fork tag", () => {
  sandbox((dir, env, requests) => {
    install(dir, env, ["--version", "v0.5.3"]);
    expect(requests()[0]).toBe(`${forkReleases}/download/v0.5.3/wx-bot_darwin_arm64`);
  }, { EXPECTED_RELEASE: `${forkReleases}/download/v0.5.3` });
});

test("installer preserves explicit release and raw URL overrides", () => {
  sandbox((dir, env, requests) => {
    install(dir, env, ["--version", "v0.5.3"]);
    expect(requests()).toEqual([
      "https://mirror.example.test/assets/wx-bot_darwin_arm64",
      "https://mirror.example.test/assets/checksums.txt",
      "https://mirror.example.test/raw/deploy/keepalive.sh",
    ]);
  }, {
    WXBOT_RELEASE_URL: "https://mirror.example.test/assets",
    WXBOT_RAW_URL: "https://mirror.example.test/raw",
    EXPECTED_RELEASE: "https://mirror.example.test/assets",
    EXPECTED_RAW: "https://mirror.example.test/raw",
  });
});

test("keepalive recovery reinstalls from the fork when the binary is missing", () => {
  sandbox((_dir, env, requests) => {
    const result = Bun.spawnSync(["/bin/sh"], { env, stdin: Buffer.from(keepalive) });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trim()).toBe("ok");
    expect(requests()[0]).toBe(`${forkRaw}/install.sh`);
    expect(requests()[1]).toBe(`${forkReleases}/latest/download/wx-bot_darwin_arm64`);
  });
});

test("WXBOT_BINARY still installs a provided local binary without release downloads", () => {
  sandbox((dir, env, requests) => {
    install(dir, { ...env, WXBOT_BINARY: join(dir, "wx-bot_darwin_arm64") });
    expect(requests()).toEqual([`${forkRaw}/deploy/keepalive.sh`]);
  });
});

test("a checksum mismatch leaves an existing binary and config untouched", () => {
  sandbox((dir, env, requests) => {
    const target = join(dir, "prefix/bin/wx-bot");
    mkdirSync(join(dir, "prefix/bin"), { recursive: true });
    const original = '#!/bin/sh\necho "wx-bot v0.5.2"\n';
    writeFileSync(target, original, { mode: 0o755 });
    writeFileSync(join(dir, "checksums.txt"), `${"0".repeat(64)}  wx-bot_darwin_arm64\n`);
    const result = Bun.spawnSync(["/bin/bash", "-s", "--", "--release", "--prefix", join(dir, "prefix")], {
      env, stdin: Buffer.from(installer),
    });
    expect(result.exitCode).not.toBe(0);
    expect(readFileSync(target, "utf8")).toBe(original);
    expect(requests()).toHaveLength(2);
  });
});
