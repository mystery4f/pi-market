import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { marketDir } from "./paths.ts";
import { readPack } from "./registry/pack.ts";
import type { SettingsStore } from "./registry/settings.ts";

/** Where fetched remote sources are materialised, beside the market root. */
export function cacheRoot(env: NodeJS.ProcessEnv = process.env): string {
  return join(marketDir(env), "..", "cache");
}

export interface DoctorReport {
  ok: boolean;
  issues: string[];
  lines: string[];
}

/**
 * Compare what the registry lists with what the market root holds. A pack directory without a
 * manifest, a manifest whose bridge package is not registered, and a registry entry that points
 * at nothing are reported with the path each problem was seen at.
 */
export async function doctor(root: string, settings: SettingsStore): Promise<DoctorReport> {
  const issues: string[] = [];
  const directories: string[] = [];
  try {
    const dirents = await readdir(root, { withFileTypes: true });
    for (const entry of dirents) {
      if (entry.isDirectory()) directories.push(join(root, entry.name));
    }
  } catch {
    // No market root yet: nothing registered, nothing to report.
  }

  const track = new Set<string>();
  for (const dir of directories) {
    const manifest = await readPack(dir);
    if (!manifest) {
      issues.push(`pack directory without pack.json: ${dir}`);
      continue;
    }
    track.add(dir);
    if (!settings.packages().some((entry) => entry === dir)) {
      issues.push(`pack not registered in settings.json: ${dir} (${manifest.slug})`);
    }
  }

  for (const entry of settings.packages()) {
    if (!track.has(entry)) {
      issues.push(`registry entry with no pack on disk: ${entry}`);
    }
  }

  return { ok: issues.length === 0, issues, lines: issues };
}
