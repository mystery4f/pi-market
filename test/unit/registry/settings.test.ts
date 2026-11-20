import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

  it("adds a bridge entry without touching the rest of the file", async () => {
    await runWithText(
      JSON.stringify({ packages: ["npm:@one/a", "C:\\packs\\a"], model: "x" }, null, 2),
      async (dir, file) => {
        const store = await SettingsStore.load(file);
        await store.ensurePackage(join(dir, "packs", "slug-a"));
        const text = await readFile(file, "utf8");
        expect(text).toContain(`"packages"`);
        expect(text).toContain(JSON.stringify(join(dir, "packs", "slug-a")));
        expect(JSON.parse(text)).toEqual({
          packages: ["npm:@one/a", "C:\\packs\\a", join(dir, "packs", "slug-a")],
          model: "x",
        });
      },
    );
  });

  it("refuses to add the same pack twice even through a relative form", async () => {
    await runWithText("{}", async (dir, file) => {
      const store = await SettingsStore.load(file);
      await store.ensurePackage(join(dir, "packs", "s"));
      await store.ensurePackage(join(dir, "packs", "s"));
      const text = await readFile(file, "utf8");
      expect(JSON.parse(text)).toEqual({ packages: [join(dir, "packs", "s")] });
    });
  });

  it("removes a bridge entry and keeps foreign ones", async () => {
    await runWithText(
      JSON.stringify({ packages: [join("C:", "packs", "a"), "npm:@one/a"] }, null, 2),
      async (_dir, file) => {
        const store = await SettingsStore.load(file);
        await store.removePackage(join("C:", "packs", "a"));
        const text = await readFile(file, "utf8");
        expect(JSON.parse(text)).toEqual({ packages: ["npm:@one/a"] });
      },
    );
  });

  it("survives entries that carry their own empty arrays", async () => {
    const original = {
      packages: [
        { source: "npm:pi-extmgr", extensions: [] },
        "npm:@one/a",
        { source: "npm:@two/b", extensions: [], skills: [] },
      ],
      model: "x",
    };
    await runWithText(JSON.stringify(original, null, 2), async (dir, file) => {
      const store = await SettingsStore.load(file);
      expect(store.packages()).toEqual(["npm:@one/a"]);
      await store.ensurePackage(join(dir, "packs", "slug-a"));
      const added = JSON.parse(await readFile(file, "utf8")) as { packages: unknown[] };
      expect(added.packages).toEqual([...original.packages, join(dir, "packs", "slug-a")]);
    });
  });

  it("refuses to write when the span cannot be rebuilt cleanly", async () => {
    await runWithText('{ "packages": [ "npm:@one/a" ]', async (_dir, file) => {
      const store = await SettingsStore.load(file);
      await expect(store.ensurePackage(join("C:", "packs", "x"))).rejects.toThrow(/does not parse/);
    });
  });
  it("adds the market entry once, however often an install runs", async () => {
    await runWithText('{ "packages": ["npm:@one/a"] }', async (dir, file) => {
      const store = await SettingsStore.load(file);
      await store.ensurePackage(join(dir, "market"));
      await store.ensurePackage(join(dir, "market"));

      const again = await SettingsStore.load(file);
      expect(again.packages()).toEqual(["npm:@one/a", join(dir, "market")]);
    });
  });
});
