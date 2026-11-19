import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** One installed source, as written by the installer and read back by every verb. */
export interface PackManifest {
  /** Directory name under the market root; stable for the life of the pack. */
  slug: string;
  /** The source as the user typed it, normalised — what `market update` fetches again. */
  source: string;
  /** The prefix the user configured for this source; every artefact name starts with it. */
  prefix: string;
  adapter: string;
  /** Commit the artifacts were converted from. */
  commit: string;
  /** Branch or tag the pack follows. Present unless the source is a local directory. */
  ref?: string;
  /** A commit or tag that update must not move past. */
  pin?: string;
  installedAt: string;
  updatedAt: string;
  plugins: string[];
  artifacts: { skills: string[]; prompts: string[] };
  rewrites: { from: string; to: string; where: string }[];
  errors: { source: string; message: string }[];
}

/** What `market_list` reports per pack: enough to decide, not the whole manifest. */
export interface PackSummary {
  slug: string;
  source: string;
  prefix: string;
  adapter: string;
  commit: string;
  pin?: string;
  skills: number;
  prompts: number;
  errors: number;
  installedAt: string;
  updatedAt: string;
}

export interface PackReadResult {
  packs: PackSummary[];
  /** Directories that look like a pack but did not yield a usable manifest. */
  problems: { path: string; message: string }[];
}

export function summarise(manifest: PackManifest): PackSummary {
  return {
    slug: manifest.slug,
    source: manifest.source,
    prefix: manifest.prefix,
    adapter: manifest.adapter,
    commit: manifest.commit,
    ...(manifest.pin === undefined ? {} : { pin: manifest.pin }),
    skills: manifest.artifacts.skills.length,
    prompts: manifest.artifacts.prompts.length,
    errors: manifest.errors.length,
    installedAt: manifest.installedAt,
    updatedAt: manifest.updatedAt,
  };
}

/**
 * Every pack under `root`, newest install last. A directory without a manifest is reported
 * as a problem instead of silently dropped: it is what an interrupted install leaves behind.
 */
export async function listPacks(root: string): Promise<PackReadResult> {
  let entries: string[];
  try {
    const dirents = await readdir(root, { withFileTypes: true });
    entries = dirents.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { packs: [], problems: [] };
    throw error;
  }

  const packs: PackSummary[] = [];
  const problems: PackReadResult["problems"] = [];

  for (const entry of entries.sort()) {
    const manifestPath = join(root, entry, "pack.json");
    let raw: string;
    try {
      raw = await readFile(manifestPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      problems.push({ path: manifestPath, message: (error as Error).message });
      continue;
    }
    try {
      packs.push(summarise(JSON.parse(raw) as PackManifest));
    } catch (error) {
      problems.push({ path: manifestPath, message: `not valid JSON: ${(error as Error).message}` });
    }
  }

  packs.sort((a, b) => a.installedAt.localeCompare(b.installedAt));
  return { packs, problems };
}
