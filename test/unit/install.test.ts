import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installFromDir, slugFor } from "../../src/market/install.ts";
import { SettingsStore } from "../../src/market/registry/settings.ts";
import { withTempDir } from "../support/fixtures.ts";
import { writeMarketplace } from "../support/source-fixtures.ts";

describe("slugFor", () => {
  it("names a pack after its repository, not its host or ref", () => {
    expect(slugFor("phuryn/pm-skills")).toBe("phuryn-pm-skills");
    expect(slugFor("https://github.com/phuryn/pm-skills.git")).toBe("phuryn-pm-skills");
    expect(slugFor("git+https://github.com/phuryn/pm-skills@main")).toBe("phuryn-pm-skills");
  });

  it("names a local pack after its directory", () => {
    expect(slugFor("C:\\work\\my-skills")).toBe("my-skills");
  });
});

describe("installPack", () => {
  it("installs a marketplace, records it and registers one bridge entry", async () => {
    await withTempDir(async (dir) => {
      const sourceDir = await writeMarketplace(dir);
      const settingsFile = join(dir, "settings.json");
      await writeFile(settingsFile, '{\n  "model": "keep-me"\n}', "utf8");

      const outcome = await installFromDir({
        source: "phuryn/pm-skills",
        sourceDir,
        commit: "a".repeat(40),
        root: join(dir, "market"),
        settings: await SettingsStore.load(settingsFile),
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      });

      expect(outcome.manifest.slug).toBe("phuryn-pm-skills");
      expect(outcome.manifest.adapter).toBe("claude-marketplace");
      expect(outcome.manifest.installedAt).toBe("2026-01-01T00:00:00.000Z");
      expect(outcome.manifest.artifacts.skills).toEqual([
        "pm-execution-grill",
        "pm-execution-retro",
        "pm-strategy-vision",
      ]);
      expect(outcome.manifest.artifacts.prompts).toEqual([
        "pm-execution-backlog",
        "pm-execution-qna",
      ]);

      const settingsText = await readFile(settingsFile, "utf8");
      expect(JSON.parse(settingsText)).toEqual({ model: "keep-me", packages: [outcome.packDir] });
    });
  });

  it("keeps installedAt and the pin across a re-install", async () => {
    await withTempDir(async (dir) => {
      const sourceDir = await writeMarketplace(dir);
      const settingsFile = join(dir, "settings.json");
      await writeFile(settingsFile, "{}", "utf8");

      const first = await installFromDir({
        source: "phuryn/pm-skills",
        sourceDir,
        commit: "b".repeat(40),
        root: join(dir, "market"),
        settings: await SettingsStore.load(settingsFile),
        pin: "v1",
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      });

      const second = await installFromDir({
        source: "phuryn/pm-skills",
        sourceDir,
        commit: "c".repeat(40),
        root: join(dir, "market"),
        settings: await SettingsStore.load(settingsFile),
        now: () => new Date("2026-02-02T00:00:00.000Z"),
      });

      expect(second.manifest.installedAt).toBe(first.manifest.installedAt);
      expect(second.manifest.updatedAt).toBe("2026-02-02T00:00:00.000Z");
      expect(second.manifest.pin).toBe("v1");
      expect(second.manifest.commit).toBe("c".repeat(40));
      expect(second.packDir).toBe(first.packDir);
    });
  });

  it("refuses a source it cannot recognise", async () => {
    await withTempDir(async (dir) => {
      const empty = join(dir, "empty");
      await mkdir(empty, { recursive: true });
      await expect(
        installFromDir({
          source: "x/empty",
          sourceDir: empty,
          commit: "d".repeat(40),
          root: join(dir, "market"),
          settings: await SettingsStore.load(join(dir, "settings.json")),
        }),
      ).rejects.toThrow(/produced no skills or commands/);
    });
  });

  it("installs only the plugins the user asked for", async () => {
    await withTempDir(async (dir) => {
      const sourceDir = await writeMarketplace(dir);
      const outcome = await installFromDir({
        source: "phuryn/pm-skills",
        sourceDir,
        commit: "e".repeat(40),
        root: join(dir, "market"),
        settings: await SettingsStore.load(join(dir, "settings.json")),
        plugins: ["pm-execution"],
      });
      expect(outcome.manifest.plugins).toEqual(["pm-execution"]);
      expect(outcome.manifest.artifacts.skills).toEqual([
        "pm-execution-grill",
        "pm-execution-retro",
      ]);
    });
  });
});
