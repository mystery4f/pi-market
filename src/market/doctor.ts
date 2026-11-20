import { join, sep } from "node:path";
import { listPacks, scanPackDir } from "./packs.ts";
import { marketDir } from "./paths.ts";
import { marketEntry } from "./registry/bridge.ts";
import type { SettingsStore } from "./registry/settings.ts";
import { isEnabled } from "./state.ts";

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
 * Compare the market directory with what settings.json loads. The whole market is one package
 * entry, so a missing entry, a leftover per-pack entry, a registered pack with nothing generated,
 * and a directory nobody registered are each reported with the path the problem was seen at.
 */
export async function doctor(root: string, settings: SettingsStore): Promise<DoctorReport> {
  const issues: string[] = [];
  const result = await listPacks(root);
  const entry = marketEntry(settings.filePath, root);

  if (!settings.has(entry)) {
    issues.push(`market package not registered in settings.json: add "${entry}" to packages`);
  }
  for (const value of settings.packages()) {
    if (value.startsWith(`${root}${sep}`)) {
      issues.push(`per-pack entry left in settings.json: ${value} (packages needs "${entry}")`);
    }
  }

  for (const problem of result.problems) {
    issues.push(`${problem.message}: ${problem.path}`);
  }

  for (const pack of result.packs) {
    const dir = join(root, pack.slug);
    if (!(await isEnabled(dir))) continue;
    if (pack.skills.length > 0 || pack.prompts.length > 0) continue;
    const generated = await scanPackDir(dir);
    if (generated.skills.length === 0 && generated.prompts.length === 0) {
      issues.push(`registered pack with an empty generated tree: ${dir} (${pack.slug})`);
    }
  }

  return { ok: issues.length === 0, issues, lines: issues };
}
