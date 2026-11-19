import { describe, expect, it } from "vitest";
import { detectSource, readSource } from "../../../src/market/adapters/index.ts";
import { withTempDir } from "../../support/fixtures.ts";
import {
  writeBareSkills,
  writeMarketplace,
  writePlugin,
  writeSingleSkill,
} from "../../support/source-fixtures.ts";

describe("detectSource", () => {
  it("claims a marketplace over a single plugin framing when both are present", async () => {
    await withTempDir(async (dir) => {
      const root = await writeMarketplace(dir);
      const result = await detectSource(root);
      expect(result.matched).toBe(true);
      if (result.matched) expect(result.adapter.id).toBe("claude-marketplace");
    });
  });

  it("falls back to a single plugin when there is no marketplace file", async () => {
    await withTempDir(async (dir) => {
      const root = await writePlugin(dir);
      const result = await detectSource(root);
      expect(result.matched).toBe(true);
      if (result.matched) expect(result.adapter.id).toBe("claude-plugin");
    });
  });

  it("recognises a bare skills tree only at the final position", async () => {
    await withTempDir(async (dir) => {
      const root = await writeBareSkills(dir);
      const result = await detectSource(root);
      expect(result.matched).toBe(true);
      if (result.matched) expect(result.adapter.id).toBe("bare-skills");
    });
  });

  it("matches any existing directory as local-dir, and notes why", async () => {
    await withTempDir(async (dir) => {
      const root = await writeSingleSkill(dir);
      const result = await detectSource(root);
      expect(result.matched).toBe(true);
      if (result.matched) expect(result.adapter.id).toBe("local-dir");
    });
  });
});

describe("readSource", () => {
  it("reads a marketplace with all plugins and a note for a remote source", async () => {
    await withTempDir(async (dir) => {
      const root = await writeMarketplace(dir);
      const model = await readSource(root);
      expect(model.adapter).toBe("claude-marketplace");
      expect(model.plugins.map((plugin) => plugin.name)).toEqual(["pm-execution", "pm-strategy"]);
      const execution = model.plugins.find((plugin) => plugin.name === "pm-execution");
      expect(execution?.skills.map((skill) => skill.name)).toEqual(["grill", "retro"]);
      expect(execution?.commands.map((command) => command.name)).toEqual(["backlog", "qna"]);
      expect(execution?.version).toBe("2.0.0");
      expect(model.notes.some((note) => note.includes("pm-remote"))).toBe(true);
    });
  });

  it("reads only the plugins named in options", async () => {
    await withTempDir(async (dir) => {
      const root = await writeMarketplace(dir);
      const model = await readSource(root, { plugins: ["pm-strategy"] });
      expect(model.plugins.map((plugin) => plugin.name)).toEqual(["pm-strategy"]);
      expect(model.notes.some((note) => note.includes("pm-execution"))).toBe(false);
      expect(model.notes.some((note) => note.includes("pm-strategy"))).toBe(false);
    });
  });

  it("reads a bare skills tree via the namespaced plugin of package.json", async () => {
    await withTempDir(async (dir) => {
      const root = await writeBareSkills(dir);
      const model = await readSource(root);
      expect(model.plugins).toHaveLength(1);
      expect(model.plugins[0]?.name).toBe("toolbox");
      expect(model.plugins[0]?.skills.map((skill) => skill.name)).toEqual(["alpha", "beta"]);
    });
  });

  it("rejects an unknown adapter id with the known ids", async () => {
    await withTempDir(async (dir) => {
      const root = await writeMarketplace(dir);
      await expect(readSource(root, { adapter: "nope" })).rejects.toThrow(
        /Unknown adapter nope\. Known adapters: /,
      );
    });
  });

  it("reads a directory that only contains a SKILL.md as a single-skill plugin", async () => {
    await withTempDir(async (dir) => {
      const root = await writeSingleSkill(dir);
      const model = await readSource(root, { adapter: "local-dir" });
      expect(model.plugins.map((plugin) => plugin.name)).toEqual(["single"]);
      expect(model.plugins[0]?.skills.map((skill) => skill.name)).toEqual(["single"]);
    });
  });
});
