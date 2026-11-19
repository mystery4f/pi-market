import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  verbDisable,
  verbDoctor,
  verbEnable,
  verbInstall,
  verbList,
  verbRemove,
  verbUpdate,
} from "../../src/market/commands.ts";
import { readPack } from "../../src/market/registry/pack.ts";
import { SettingsStore } from "../../src/market/registry/settings.ts";
import { withTempDir } from "../support/fixtures.ts";
import { writeMarketplace } from "../support/source-fixtures.ts";

/** Run the verbs against a sandboxed market root and settings file. */
async function withEnv(root: string, base: string, run: () => Promise<void>): Promise<void> {
  const previousMarket = process.env.PI_MARKET_DIR;
  const previousAgent = process.env.PI_CODING_AGENT_DIR;
  const agentDir = join(base, "agent");
  await mkdir(agentDir, { recursive: true });
  process.env.PI_MARKET_DIR = root;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    await run();
  } finally {
    if (previousMarket === undefined) delete process.env.PI_MARKET_DIR;
    else process.env.PI_MARKET_DIR = previousMarket;
    if (previousAgent === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgent;
  }
}

describe("verb surface", () => {
  it("list reports empty when nothing is installed", async () => {
    await withTempDir(async (dir) => {
      await withEnv(join(dir, "market"), dir, async () => {
        const result = await verbList();
        expect(result.text).toContain("No market packs installed");
        expect(result.details.packs).toBe(0);
      });
    });
  });

  it("install + list + doctor round-trips a local marketplace source", async () => {
    await withTempDir(async (dir) => {
      const source = await writeMarketplace(dir);
      await withEnv(join(dir, "market"), dir, async () => {
        const installed = await verbInstall({ source, plugins: ["pm-execution"] });
        expect(installed.text).toContain("mkt installed");
        expect(installed.text).toContain("(1 plugins, 2 skills, 2 prompts)");
        expect((installed.details.manifest as { plugins: string[] }).plugins).toContain(
          "pm-execution",
        );
        const packDir = installed.details.packDir as string;
        expect(packDir).toContain(join("market", "mkt"));

        const listed = await verbList();
        expect(listed.text).toContain("mkt");
        expect(listed.details.packs).toBe(1);

        const health = await verbDoctor();
        expect(health.details.ok).toBe(true);
      });
    });
  });

  it("disable keeps files but drops the registry entry; enable restores it", async () => {
    await withTempDir(async (dir) => {
      const source = await writeMarketplace(dir);
      await withEnv(join(dir, "market"), dir, async () => {
        const installed = await verbInstall({ source });
        const packDir = installed.details.packDir as string;

        const disabled = await verbDisable(packDir);
        expect(disabled.text).toContain("disabled");
        const settings = await SettingsStore.load(join(dir, "agent", "settings.json"));
        expect(settings.packages()).not.toContain(packDir);
        // The directory is still there.
        const entries = await readdir(join(dir, "market", "mkt"));
        expect(entries).toContain("pack.json");

        const enabled = await verbEnable(packDir);
        expect(enabled.text).toContain("enabled");
        const after = await SettingsStore.load(join(dir, "agent", "settings.json"));
        expect(after.packages()).toContain(packDir);
      });
    });
  });

  it("remove deletes the pack directory and registry entry", async () => {
    await withTempDir(async (dir) => {
      const source = await writeMarketplace(dir);
      await withEnv(join(dir, "market"), dir, async () => {
        const installed = await verbInstall({ source });
        const packDir = installed.details.packDir as string;

        const removed = await verbRemove(packDir);
        expect(removed.text).toContain("removed");
        const settings = await SettingsStore.load(join(dir, "agent", "settings.json"));
        expect(settings.packages()).not.toContain(packDir);
        await expect(readPack(packDir)).resolves.toBeUndefined();
      });
    });
  });

  it("doctor reports a pack on disk that the registry forgot", async () => {
    await withTempDir(async (dir) => {
      const source = await writeMarketplace(dir);
      await withEnv(join(dir, "market"), dir, async () => {
        await verbInstall({ source });
        // Drop the registry entry as if by hand.
        const settingsFile = join(dir, "agent", "settings.json");
        const settings = await SettingsStore.load(settingsFile);
        await settings.removePack(join(dir, "market", "mkt"));

        const health = await verbDoctor();
        expect(health.details.ok).toBe(false);
        expect(health.text).toContain("not registered");
      });
    });
  });

  it("update with no target updates every installed pack", async () => {
    await withTempDir(async (dir) => {
      const source = await writeMarketplace(dir);
      await withEnv(join(dir, "market"), dir, async () => {
        await verbInstall({ source });
        const result = await verbUpdate();
        expect(result.text).toContain("already at");
      });
    });
  });
});
