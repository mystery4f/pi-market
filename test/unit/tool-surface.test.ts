import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
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
import { readRegistry } from "../../src/market/packs.ts";
import { SettingsStore } from "../../src/market/registry/settings.ts";
import { withTempDir } from "../support/fixtures.ts";
import { writeMarketplace } from "../support/source-fixtures.ts";

/** Run the verbs against a sandboxed market root and settings file. */
async function withEnv(root: string, base: string, run: () => Promise<void>): Promise<void> {
  const previousMarket = process.env.PI_MARKET_DIR;
  const previousAgent = process.env.PI_CODING_AGENT_DIR;
  const agentDir = join(base, "agent");
  await mkdir(agentDir, { recursive: true });
  await writeFile(
    join(agentDir, "settings.json"),
    `${JSON.stringify({ packages: ["git:github.com/mystery4f/pi-market"] }, null, 2)}
`,
    "utf8",
  );
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

/** True when the registry file exists in this market root. */
async function hasRegistry(root: string): Promise<boolean> {
  try {
    await stat(join(root, "market.json"));
    return true;
  } catch {
    return false;
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
        const installed = await verbInstall({ source, prefix: "pm", plugins: ["pm-execution"] });
        expect(installed.text).toContain("mkt installed");
        expect(installed.text).toContain("(1 plugins, 2 skills, 2 prompts)");
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

  it("disable moves the generated tree aside; enable brings it back", async () => {
    await withTempDir(async (dir) => {
      const source = await writeMarketplace(dir);
      const root = join(dir, "market");
      await withEnv(root, dir, async () => {
        const installed = await verbInstall({ source, prefix: "pm" });
        const packDir = installed.details.packDir as string;

        const disabled = await verbDisable(packDir);
        expect(disabled.text).toContain("disabled");
        // The files are kept, out of the glob's reach, and the market package is untouched.
        await expect(readdir(join(root, "mkt", "generated"))).rejects.toThrow(/ENOENT/);
        expect(await readdir(join(root, "mkt", "generated.disabled", "skills"))).not.toHaveLength(
          0,
        );
        expect(await hasRegistry(root)).toBe(true);
        const settings = await SettingsStore.load(join(dir, "agent", "settings.json"));
        expect(settings.packages()).toEqual(["git:github.com/mystery4f/pi-market"]);

        const enabled = await verbEnable(packDir);
        expect(enabled.text).toContain("enabled");
        expect(await readdir(join(root, "mkt", "generated", "skills"))).not.toHaveLength(0);
      });
    });
  });

  it("remove deletes the pack directory and the registry record", async () => {
    await withTempDir(async (dir) => {
      const source = await writeMarketplace(dir);
      const root = join(dir, "market");
      await withEnv(root, dir, async () => {
        const installed = await verbInstall({ source, prefix: "pm" });
        const packDir = installed.details.packDir as string;

        const removed = await verbRemove(packDir);
        expect(removed.text).toContain("removed");
        const settings = await SettingsStore.load(join(dir, "agent", "settings.json"));
        expect(settings.packages()).toEqual(["git:github.com/mystery4f/pi-market"]);
        const { registry } = await readRegistry(root);
        expect(registry.packs).toEqual([]);
        await expect(readdir(packDir)).rejects.toThrow(/ENOENT/);
      });
    });
  });

  it("doctor reports a pack on disk that the settings file forgot", async () => {
    await withTempDir(async (dir) => {
      const source = await writeMarketplace(dir);
      await withEnv(join(dir, "market"), dir, async () => {
        await verbInstall({ source, prefix: "pm" });
        // Drop the extension entry as if by hand; the registry keeps the pack.
        const settingsFile = join(dir, "agent", "settings.json");
        const settings = await SettingsStore.load(settingsFile);
        await settings.removePackage("git:github.com/mystery4f/pi-market");

        const health = await verbDoctor();
        expect(health.details.ok).toBe(false);
        expect(health.text).toContain("does not load pi-market");
      });
    });
  });

  it("update with no target updates every installed pack", async () => {
    await withTempDir(async (dir) => {
      const source = await writeMarketplace(dir);
      await withEnv(join(dir, "market"), dir, async () => {
        await verbInstall({ source, prefix: "pm" });
        const result = await verbUpdate();
        expect(result.text).toContain("already at");
      });
    });
  });
});
