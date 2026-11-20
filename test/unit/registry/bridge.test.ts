import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanPackDir } from "../../../src/market/packs.ts";
import {
  EXTENSION_SOURCE,
  MARKET_PROMPTS_GLOB,
  MARKET_SKILLS_GLOB,
  manifestResources,
  reachesPacks,
} from "../../../src/market/registry/bridge.ts";
import { withTempDir } from "../../support/fixtures.ts";

describe("manifest resources", () => {
  it("globs the market trees from this package's own root", () => {
    expect(manifestResources()).toEqual({
      skills: [MARKET_SKILLS_GLOB],
      prompts: [MARKET_PROMPTS_GLOB],
    });
    expect(MARKET_SKILLS_GLOB.startsWith("..")).toBe(true);
  });

  it("keeps package.json in step with the globs the code relies on", async () => {
    const text = await readFile(join(process.cwd(), "package.json"), "utf8");
    const manifest = JSON.parse(text) as { pi: { skills: string[]; prompts: string[] } };
    expect(manifest.pi.skills).toEqual([MARKET_SKILLS_GLOB]);
    expect(manifest.pi.prompts).toEqual([MARKET_PROMPTS_GLOB]);
  });

  it("sees the packs through this extension's own entry, never through a per-pack one", () => {
    expect(reachesPacks([`git:github.com/mystery4f/${EXTENSION_SOURCE}`])).toBe(true);
    expect(reachesPacks(["C:/Users/me/.pi/market/phuryn-pm-skills"])).toBe(false);
  });
});

describe("pack registry", () => {
  it("scans the generated trees a pack really holds", async () => {
    await withTempDir(async (dir) => {
      const packDir = join(dir, "pm-skills");
      await mkdir(join(packDir, "generated", "skills", "pm-retro"), { recursive: true });
      await mkdir(join(packDir, "generated", "prompts"), { recursive: true });
      await writeFile(join(packDir, "generated", "prompts", "pm-backlog.md"), "# x", "utf8");
      await writeFile(join(packDir, "generated", "prompts", "pm-qna.md"), "# y", "utf8");

      const artifacts = await scanPackDir(packDir);
      expect(artifacts).toEqual({ skills: ["pm-retro"], prompts: ["pm-backlog", "pm-qna"] });
    });
  });

  it("reports no artefacts for a directory that was never installed", async () => {
    await withTempDir(async (dir) => {
      expect(await scanPackDir(join(dir, "missing"))).toEqual({ skills: [], prompts: [] });
    });
  });
});
