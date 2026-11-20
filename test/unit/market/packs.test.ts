import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findPack,
  listPacks,
  readRegistry,
  removePackRecord,
  upsertPack,
} from "../../../src/market/packs.ts";
import { record, withTempDir, writeRegistryRecord } from "../../support/fixtures.ts";

describe("registry", () => {
  it("reads an empty market for a missing registry file", async () => {
    await withTempDir(async (dir) => {
      const result = await listPacks(join(dir, "missing"));
      expect(result).toEqual({ packs: [], problems: [] });
    });
  });

  it("summarises each pack with its live artefact counts", async () => {
    await withTempDir(async (dir) => {
      await writeRegistryRecord(dir, record({ slug: "a-source" }));
      await writeRegistryRecord(
        dir,
        record({ slug: "b-source", installedAt: "2026-11-19T11:00:00.000Z" }),
      );
      await writeFile(join(dir, "a-source", "generated", "prompts", "pm-qna.md"), "# Qna", "utf8");
      const skillDir = join(dir, "b-source", "generated", "skills", "pm-retro");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "# Reto", "utf8");
      const result = await listPacks(dir);
      expect(result.problems).toEqual([]);
      expect(result.packs.map((pack) => pack.slug)).toEqual(["a-source", "b-source"]);
      expect(result.packs[0]).toMatchObject({ skills: [], prompts: ["pm-qna"] });
      expect(result.packs[1]).toMatchObject({ skills: ["pm-retro"], prompts: [] });
    });
  });

  it("reports a directory with no registry entry and keeps it", async () => {
    await withTempDir(async (dir) => {
      await mkdir(join(dir, "orphan"), { recursive: true });
      const result = await listPacks(dir);
      expect(result.packs).toEqual([]);
      expect(result.problems).toHaveLength(1);
      expect(result.problems[0]?.path).toBe(join(dir, "orphan"));
    });
  });

  it("reports a registered pack whose generated tree is empty", async () => {
    await withTempDir(async (dir) => {
      await upsertPack(dir, record({ slug: "empty", source: "noop/empty" }));
      const result = await listPacks(dir);
      expect(result.packs).toHaveLength(1);
      expect(result.problems).toHaveLength(1);
      expect(result.problems[0]?.message).toContain("generated directory is empty");
    });
  });

  it("upserts in place and removePackRecord drops only its own slug", async () => {
    await withTempDir(async (dir) => {
      await writeRegistryRecord(dir, record({ slug: "same" }));
      await writeRegistryRecord(
        dir,
        record({ slug: "same", installedAt: "2026-11-19T12:00:00.000Z" }),
      );
      const { registry } = await readRegistry(dir);
      expect(registry.packs).toHaveLength(1);
      expect(registry.packs[0]?.installedAt).toBe("2026-11-19T12:00:00.000Z");

      expect(await removePackRecord(dir, "same")).toBe(true);
      const again = await readRegistry(dir);
      expect(again.registry.packs).toEqual([]);
    });
  });

  it("findPack resolves by slug", async () => {
    await withTempDir(async (dir) => {
      await writeRegistryRecord(dir, record({ slug: "pm-skills" }));
      const found = await findPack(dir, "pm-skills");
      expect(found?.slug).toBe("pm-skills");
    });
  });
});
