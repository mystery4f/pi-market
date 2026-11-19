import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { installSource } from "../../src/market/install.ts";
import type { PackManifest } from "../../src/market/packs.ts";
import { SettingsStore } from "../../src/market/registry/settings.ts";
import { updatePack } from "../../src/market/update.ts";
import { withTempDir } from "../support/fixtures.ts";
import { writeMarketplace } from "../support/source-fixtures.ts";

const run = promisify(execFile);

async function initRepo(dir: string): Promise<void> {
  await run("git", ["init", "-q", dir]);
  await run("git", ["-C", dir, "config", "user.email", "t@t.invalid"]);
  await run("git", ["-C", dir, "config", "user.name", "test"]);
}

async function commitAll(dir: string, message: string): Promise<string> {
  await run("git", ["-C", dir, "add", "-A"]);
  await run("git", ["-C", dir, "commit", "-q", "-m", message]);
  const { stdout } = await run("git", ["-C", dir, "rev-parse", "HEAD"]);
  return stdout.trim();
}

async function installFixture(dir: string, source: string): Promise<PackManifest> {
  const settingsFile = join(dir, "settings.json");
  await writeFile(settingsFile, "{}", "utf8");
  const outcome = await installSource({
    source,
    prefix: "pm",
    cacheRoot: join(dir, "cache"),
    root: join(dir, "market"),
    settings: await SettingsStore.load(settingsFile),
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  return outcome.manifest;
}

async function addExtraSkill(sourceDir: string): Promise<void> {
  const extra = join(sourceDir, "pm-execution", "skills", "extra");
  await mkdir(extra, { recursive: true });
  await writeFile(join(extra, "SKILL.md"), "# Extra\n", "utf8");
}

describe("updatePack", () => {
  it("re-converts when the source commit moved", async () => {
    await withTempDir(async (dir) => {
      const sourceDir = await writeMarketplace(dir);
      await initRepo(sourceDir);
      const first = await commitAll(sourceDir, "one");

      const manifest = await installFixture(dir, sourceDir);
      expect(manifest.commit).toBe(first);

      await addExtraSkill(sourceDir);
      const second = await commitAll(sourceDir, "two");
      expect(second).not.toBe(first);

      const outcome = await updatePack(manifest, {
        root: join(dir, "market"),
        cacheRoot: join(dir, "cache"),
        settings: await SettingsStore.load(join(dir, "settings.json")),
        now: () => new Date("2026-02-02T00:00:00.000Z"),
      });

      expect(outcome.changed).toBe(true);
      expect(outcome.commit).toBe(second);
      expect(outcome.packDir).toBe(join(dir, "market", "mkt"));
    });
  });

  it("is a no-op when the commit is unchanged", async () => {
    await withTempDir(async (dir) => {
      const sourceDir = join(dir, "plain");
      await mkdir(join(sourceDir, "skills", "a"), { recursive: true });
      await writeFile(join(sourceDir, "skills", "a", "SKILL.md"), "# A\n", "utf8");

      const manifest = await installFixture(dir, sourceDir);
      const outcome = await updatePack(manifest, {
        root: join(dir, "market"),
        cacheRoot: join(dir, "cache"),
        settings: await SettingsStore.load(join(dir, "settings.json")),
      });

      expect(outcome.changed).toBe(false);
      expect(outcome.commit).toBe(manifest.commit);
    });
  });

  it("refuses to move past a pin", async () => {
    await withTempDir(async (dir) => {
      const sourceDir = await writeMarketplace(dir);
      await initRepo(sourceDir);
      await commitAll(sourceDir, "one");

      const manifest = await installFixture(dir, sourceDir);
      const pinned = { ...manifest, pin: manifest.commit };

      await addExtraSkill(sourceDir);
      await commitAll(sourceDir, "two");

      await expect(
        updatePack(pinned, {
          root: join(dir, "market"),
          cacheRoot: join(dir, "cache"),
          settings: await SettingsStore.load(join(dir, "settings.json")),
          now: () => new Date("2026-02-02T00:00:00.000Z"),
        }),
      ).rejects.toThrow(/past its pin/);
    });
  });
});
