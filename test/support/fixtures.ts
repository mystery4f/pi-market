import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PackManifest } from "../../src/market/packs.ts";

/** A temporary directory that the test deletes afterwards, even when it fails. */
export async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "pi-market-test-"));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function manifest(overrides: Partial<PackManifest> = {}): PackManifest {
  return {
    slug: "phuryn-pm-skills",
    source: "claude-marketplace:phuryn/pm-skills",
    adapter: "claude-marketplace",
    commit: "0123456789abcdef0123456789abcdef01234567",
    ref: "main",
    installedAt: "2026-11-19T10:00:00.000Z",
    updatedAt: "2026-11-19T10:00:00.000Z",
    plugins: ["pm-execution"],
    artifacts: { skills: ["pm-execution-retro"], prompts: ["pm-execution-retro"] },
    rewrites: [],
    errors: [],
    ...overrides,
  };
}

/** Write a pack directory holding `pack.json`, as the installer would. */
export async function writePack(root: string, value: PackManifest): Promise<string> {
  const dir = join(root, value.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "pack.json"), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return dir;
}
