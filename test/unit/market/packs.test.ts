import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listPacks, summarise } from "../../../src/market/packs.ts";
import { manifest, withTempDir, writePack } from "../../support/fixtures.ts";

describe("listPacks", () => {
  it("reports nothing for a market root that does not exist yet", async () => {
    await withTempDir(async (dir) => {
      const result = await listPacks(join(dir, "missing"));
      expect(result).toEqual({ packs: [], problems: [] });
    });
  });

  it("summarises each pack with its skill and prompt counts", async () => {
    await withTempDir(async (dir) => {
      await writePack(dir, manifest({ slug: "a-source" }));
      await writePack(
        dir,
        manifest({
          slug: "b-source",
          installedAt: "2026-11-19T11:00:00.000Z",
          artifacts: { skills: ["x", "y"], prompts: ["p"] },
        }),
      );
      const result = await listPacks(dir);
      expect(result.problems).toEqual([]);
      expect(result.packs.map((pack) => pack.slug)).toEqual(["a-source", "b-source"]);
      expect(result.packs[1]).toMatchObject({ skills: 2, prompts: 1 });
    });
  });

  it("ignores a directory with no manifest but reports one that is unreadable", async () => {
    await withTempDir(async (dir) => {
      await mkdir(join(dir, "no-manifest"), { recursive: true });
      await mkdir(join(dir, "broken"), { recursive: true });
      await writeFile(join(dir, "broken", "pack.json"), "{ not json", "utf8");
      const result = await listPacks(dir);
      expect(result.packs).toEqual([]);
      expect(result.problems).toHaveLength(1);
      expect(result.problems[0]?.path).toBe(join(dir, "broken", "pack.json"));
    });
  });
});

describe("summarise", () => {
  it("carries a pin only when the manifest has one", () => {
    expect(summarise(manifest())).not.toHaveProperty("pin");
    expect(summarise(manifest({ pin: "v2.3.0" })).pin).toBe("v2.3.0");
  });
});
