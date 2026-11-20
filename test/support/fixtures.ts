import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type PackRecord, upsertPack } from "../../src/market/packs.ts";

/** A temporary directory that the test deletes afterwards, even when it fails. */
export async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "pi-market-test-"));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A registry record shaped like the installer writes one. */
export function record(overrides: Partial<PackRecord> = {}): PackRecord {
  return {
    slug: "phuryn-pm-skills",
    source: "phuryn/pm-skills",
    prefix: "pm",
    adapter: "claude-marketplace",
    commit: "0123456789abcdef0123456789abcdef01234567",
    ref: "main",
    installedAt: "2026-11-19T10:00:00.000Z",
    updatedAt: "2026-11-19T10:00:00.000Z",
    ...overrides,
  };
}

/** Register one record in the market root, as the installer would, with empty generated trees. */
export async function writeRegistryRecord(root: string, value: PackRecord): Promise<void> {
  await mkdir(join(root, value.slug, "generated", "skills"), { recursive: true });
  await mkdir(join(root, value.slug, "generated", "prompts"), { recursive: true });
  await upsertPack(root, value);
}
