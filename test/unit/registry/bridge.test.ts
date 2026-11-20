import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanPackDir } from "../../../src/market/packs.ts";
import {
  marketEntry,
  marketPackage,
  marketPackagePath,
  writeMarketPackage,
} from "../../../src/market/registry/bridge.ts";
import { withTempDir } from "../../support/fixtures.ts";

describe("market package", () => {
  it("globs every pack's generated trees from the market root", () => {
    const manifest = marketPackage();
    expect(manifest.name).toBe("pi-market-packs");
    expect(manifest.pi).toEqual({
      skills: ["./*/generated/skills"],
      prompts: ["./*/generated/prompts"],
    });
  });

  it("writes one package.json at the market root, outside every pack", async () => {
    await withTempDir(async (dir) => {
      const root = join(dir, "market");
      await writeMarketPackage(root);

      expect(marketPackagePath(root)).toBe(join(root, "package.json"));
      const written = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
        pi: { skills: string[] };
      };
      expect(written.pi.skills).toEqual(["./*/generated/skills"]);
    });
  });

  it("names the market entry relative to the settings file, never absolutely", () => {
    const entry = marketEntry(
      join("C:", "Users", "me", ".pi", "agent", "settings.json"),
      join("C:", "Users", "me", ".pi", "market"),
    );
    expect(entry).toBe("../market");
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

function readFile(path: string, encoding: "utf8"): Promise<string> {
  return import("node:fs/promises").then((fs) => fs.readFile(path, encoding));
}
