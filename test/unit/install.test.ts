import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installFromDir, slugFor } from "../../src/market/install.ts";
import { readRegistry, scanPackDir } from "../../src/market/packs.ts";
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

describe("installFromDir", () => {
  it("installs a marketplace and records it without touching settings.json", async () => {
    await withTempDir(async (dir) => {
      const sourceDir = await writeMarketplace(dir);
      const settingsFile = join(dir, "settings.json");
      await writeFile(settingsFile, '{\n  "model": "keep-me"\n}', "utf8");

      const outcome = await installFromDir({
        source: "phuryn/pm-skills",
        prefix: "pm",
        sourceDir,
        commit: "a".repeat(40),
        root: join(dir, "market"),
        settings: await SettingsStore.load(settingsFile),
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      });

      expect(outcome.record.slug).toBe("phuryn-pm-skills");
      expect(outcome.record.adapter).toBe("claude-marketplace");
      expect(outcome.record.prefix).toBe("pm");
      expect(outcome.record.installedAt).toBe("2026-01-01T00:00:00.000Z");
      expect(await scanPackDir(outcome.packDir)).toEqual({
        skills: ["pm-grill", "pm-retro", "pm-vision"],
        prompts: ["pm-backlog", "pm-qna"],
      });

      const settingsText = await readFile(settingsFile, "utf8");
      expect(JSON.parse(settingsText)).toEqual({ model: "keep-me" });
    });
  });

  it("records the pack in the market registry, not beside the pack", async () => {
    await withTempDir(async (dir) => {
      const sourceDir = await writeMarketplace(dir);
      const root = join(dir, "market");

      await installFromDir({
        source: "phuryn/pm-skills",
        prefix: "pm",
        sourceDir,
        commit: "a".repeat(40),
        root,
        settings: await SettingsStore.load(join(dir, "settings.json")),
      });

      const { registry } = await readRegistry(root);
      expect(registry.packs.map((pack) => pack.slug)).toEqual(["phuryn-pm-skills"]);
    });
  });

  it("keeps installedAt and the pin across a re-install", async () => {
    await withTempDir(async (dir) => {
      const sourceDir = await writeMarketplace(dir);
      const settingsFile = join(dir, "settings.json");
      await writeFile(settingsFile, "{}", "utf8");

      const first = await installFromDir({
        source: "phuryn/pm-skills",
        prefix: "pm",
        sourceDir,
        commit: "b".repeat(40),
        root: join(dir, "market"),
        settings: await SettingsStore.load(settingsFile),
        pin: "v1",
        now: () => new Date("2026-01-01T00:00:00.000Z"),
      });

      const second = await installFromDir({
        source: "phuryn/pm-skills",
        prefix: "pm",
        sourceDir,
        commit: "c".repeat(40),
        root: join(dir, "market"),
        settings: await SettingsStore.load(settingsFile),
        now: () => new Date("2026-02-02T00:00:00.000Z"),
      });

      expect(second.record.installedAt).toBe(first.record.installedAt);
      expect(second.record.updatedAt).toBe("2026-02-02T00:00:00.000Z");
      expect(second.record.pin).toBe("v1");
      expect(second.record.commit).toBe("c".repeat(40));
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
          prefix: "pm",
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
        prefix: "pm",
        sourceDir,
        commit: "e".repeat(40),
        root: join(dir, "market"),
        settings: await SettingsStore.load(join(dir, "settings.json")),
        plugins: ["pm-execution"],
      });
      expect(outcome.plugins).toBe(1);
      expect(await scanPackDir(outcome.packDir)).toEqual({
        skills: ["pm-grill", "pm-retro"],
        prompts: ["pm-backlog", "pm-qna"],
      });
    });
  });
});
