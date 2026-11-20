import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SettingsStore } from "../../../src/market/registry/settings.ts";

async function runWithText(
  text: string,
  fn: (dir: string, file: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "pi-market-settings-"));
  try {
    const file = join(dir, "settings.json");
    await writeFile(file, text, "utf8");
    await fn(dir, file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("SettingsStore", () => {
  it("reads the package list and nothing else", async () => {
    await runWithText(
      JSON.stringify({ packages: ["npm:@one/a", "C:\\packs\\a"], model: "x" }, null, 2),
      async (_dir, file) => {
        const store = await SettingsStore.load(file);
        expect(store.packages()).toEqual(["npm:@one/a", "C:\\packs\\a"]);
      },
    );
  });

  it("keeps object entries readable but out of the package list", async () => {
    const text = JSON.stringify(
      { packages: [{ source: "npm:pi-extmgr", extensions: [] }, "npm:@one/a"] },
      null,
      2,
    );
    await runWithText(text, async (_dir, file) => {
      const store = await SettingsStore.load(file);
      expect(store.packages()).toEqual(["npm:@one/a"]);
      expect(store.entries()).toHaveLength(2);
    });
  });

  it("survives entries that carry their own empty arrays", async () => {
    const text = JSON.stringify(
      {
        packages: [
          { source: "npm:pi-extmgr", extensions: [] },
          "npm:@one/a",
          { source: "npm:@two/b", extensions: [], skills: [] },
        ],
        model: "x",
      },
      null,
      2,
    );
    await runWithText(text, async (_dir, file) => {
      const store = await SettingsStore.load(file);
      expect(store.packages()).toEqual(["npm:@one/a"]);
    });
  });

  it("matches a local entry against the directory the file lives in", async () => {
    await runWithText(JSON.stringify({ packages: ["../market"] }), async (dir, file) => {
      const store = await SettingsStore.load(file);
      expect(store.has(join(dir, "..", "market"))).toBe(true);
      expect(store.has(join(dir, "..", "elsewhere"))).toBe(false);
    });
  });
});
