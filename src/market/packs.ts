import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { writeJson } from "./registry/json.ts";

/** The one file the market keeps: what every pack was installed from, nothing derived. */
export const REGISTRY_FILE = "market.json";
export const REGISTRY_VERSION = 1;

/** One installed source, as the installer records it and every verb reads it back. */
export interface PackRecord {
  /** Directory name under the market root; stable for the life of the pack. */
  slug: string;
  /** The source as the user typed it, normalised — what `market update` fetches again. */
  source: string;
  /** The prefix the user configured for this source; every artefact name starts with it. */
  prefix: string;
  adapter: string;
  /** Commit the artefacts were converted from. */
  commit: string;
  /** Branch or tag the pack follows. Present unless the source is a local directory. */
  ref?: string;
  /** A commit or tag that update must not move past. */
  pin?: string;
  installedAt: string;
  updatedAt: string;
}

/** The whole store: a version to migrate on and one record per installed source. */
export interface MarketRegistry {
  version: number;
  packs: PackRecord[];
}

/** A record plus what its directory holds right now — scanned, never stored. */
export interface PackSummary extends PackRecord {
  skills: string[];
  prompts: string[];
}

export interface RegistryProblem {
  path: string;
  message: string;
}

export interface PackReadResult {
  packs: PackSummary[];
  problems: RegistryProblem[];
}

export function emptyRegistry(): MarketRegistry {
  return { version: REGISTRY_VERSION, packs: [] };
}

/** Read `market.json`; a missing file is an empty market, a broken one is a reported problem. */
export async function readRegistry(
  root: string,
): Promise<{ registry: MarketRegistry; problems: RegistryProblem[] }> {
  const file = join(root, REGISTRY_FILE);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { registry: emptyRegistry(), problems: [] };
    }
    return {
      registry: emptyRegistry(),
      problems: [{ path: file, message: (error as Error).message }],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      registry: emptyRegistry(),
      problems: [{ path: file, message: `not valid JSON: ${(error as Error).message}` }],
    };
  }

  const document = parsed as { version?: unknown; packs?: unknown };
  const packs = Array.isArray(document.packs) ? document.packs.filter(isRecord) : [];
  return {
    registry: {
      version: typeof document.version === "number" ? document.version : REGISTRY_VERSION,
      packs,
    },
    problems: [],
  };
}

/** A record missing a field cannot name a pack, so it is dropped rather than half-trusted. */
function isRecord(value: unknown): value is PackRecord {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<PackRecord>;
  return (
    typeof candidate.slug === "string" &&
    typeof candidate.source === "string" &&
    typeof candidate.prefix === "string" &&
    typeof candidate.adapter === "string" &&
    typeof candidate.commit === "string" &&
    typeof candidate.installedAt === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

export async function writeRegistry(root: string, registry: MarketRegistry): Promise<void> {
  await writeJson(join(root, REGISTRY_FILE), registry);
}

export async function findPack(root: string, slug: string): Promise<PackRecord | undefined> {
  const { registry } = await readRegistry(root);
  return registry.packs.find((pack) => pack.slug === slug);
}

/** Replace the record with the same slug, or append it. Order is install order. */
export async function upsertPack(root: string, record: PackRecord): Promise<void> {
  const { registry } = await readRegistry(root);
  const at = registry.packs.findIndex((pack) => pack.slug === record.slug);
  const packs = [...registry.packs];
  if (at === -1) packs.push(record);
  else packs[at] = record;
  await writeRegistry(root, { version: registry.version, packs });
}

/** Drop one record; returns whether it was there. The caller removes the directory. */
export async function removePackRecord(root: string, slug: string): Promise<boolean> {
  const { registry } = await readRegistry(root);
  const packs = registry.packs.filter((pack) => pack.slug !== slug);
  if (packs.length === registry.packs.length) return false;
  await writeRegistry(root, { version: registry.version, packs });
  return true;
}

/** What a pack directory currently holds. Missing directories read as empty, not as errors. */
export async function scanPackDir(
  packDir: string,
): Promise<{ skills: string[]; prompts: string[] }> {
  return {
    skills: await directoryNames(join(packDir, "generated", "skills")),
    prompts: (await fileNames(join(packDir, "generated", "prompts")))
      .filter((name) => name.endsWith(".md"))
      .map((name) => name.slice(0, -3)),
  };
}

async function directoryNames(dir: string): Promise<string[]> {
  try {
    const dirents = await readdir(dir, { withFileTypes: true });
    return dirents
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

async function fileNames(dir: string): Promise<string[]> {
  try {
    const dirents = await readdir(dir, { withFileTypes: true });
    return dirents
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Every pack the registry lists, oldest install first, each with the artefacts its directory
 * holds now. Leftover directories and records that lost their files are reported, not dropped:
 * both are what an interrupted install or update leaves behind.
 */
export async function listPacks(root: string): Promise<PackReadResult> {
  const { registry, problems: readProblems } = await readRegistry(root);
  const problems = [...readProblems];
  const packs: PackSummary[] = [];
  const known = new Set<string>();

  for (const record of registry.packs) {
    known.add(record.slug);
    const packDir = join(root, record.slug);
    const artifacts = await scanPackDir(packDir);
    if (artifacts.skills.length === 0 && artifacts.prompts.length === 0) {
      problems.push({ path: packDir, message: "registered but its generated directory is empty" });
    }
    packs.push({ ...record, skills: artifacts.skills, prompts: artifacts.prompts });
  }

  for (const entry of await directoryNames(root)) {
    if (!known.has(entry)) {
      problems.push({
        path: join(root, entry),
        message: "directory without a registry entry",
      });
    }
  }

  packs.sort((a, b) => a.installedAt.localeCompare(b.installedAt));
  return { packs, problems };
}

/**
 * Resolve a user-supplied pack reference — the slug, the source string it was installed from,
 * or a path ending in the slug — to its record. Returns undefined when nothing matches; the
 * caller decides the error text.
 */
export async function resolvePack(ref: string, root: string): Promise<PackRecord | undefined> {
  const trimmed = ref.trim();
  if (trimmed.length === 0) return undefined;
  const { registry } = await readRegistry(root);
  return (
    registry.packs.find((pack) => pack.slug === trimmed) ??
    registry.packs.find((pack) => pack.source === trimmed) ??
    registry.packs.find((pack) => basename(trimmed.replace(/[\\/]+$/, "")) === pack.slug)
  );
}
