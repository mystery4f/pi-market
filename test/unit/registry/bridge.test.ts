import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bridgeManifest, bridgePath, writeBridge } from "../../../src/market/registry/bridge.ts";
import { readPack, removePack, writePack } from "../../../src/market/registry/pack.ts";
import { manifest, withTempDir } from "../../support/fixtures.ts";

describe("bridgeManifest", () => {
  it("declares only the generated skill and prompt trees, relative to the pack root", () => {
    const manifestValue = bridgeManifest("pm-skills");
    expect(manifestValue.name).toBe("pi-market-bridge-pm-skills");
    expect(manifestValue.pi).toEqual({
      skills: ["./generated/skills"],
      prompts: ["./generated/prompts"],
    });
  });

  it("writes package.json at the pack root so its paths stay inside the package", async () => {
    await withTempDir(async (dir) => {
      const packDir = join(dir, "pm-skills");
      await writeBridge(packDir, "pm-skills");

      expect(bridgePath(packDir)).toBe(join(packDir, "package.json"));
      const written = JSON.parse(await readFile(join(packDir, "package.json"), "utf8")) as {
        pi: { skills: string[] };
      };
      expect(written.pi.skills).toEqual(["./generated/skills"]);
    });
  });
});

describe("pack registry", () => {
  it("round-trips a manifest and removes the whole pack", async () => {
    await withTempDir(async (dir) => {
      await writePack(dir, manifest({ slug: "pm-skills" }));
      expect((await readPack(dir))?.slug).toBe("pm-skills");

      await removePack(dir);
      expect(await readPack(dir)).toBeUndefined();
    });
  });

  it("reports no manifest for a directory that was never installed", async () => {
    await withTempDir(async (dir) => {
      expect(await readPack(join(dir, "missing"))).toBeUndefined();
    });
  });
});
