import { join } from "node:path";

import { readPack } from "./pack.ts";

/**
 * Resolve a user-supplied pack reference — the slug, the source string it was installed from,
 * or a path into the market root — to the pack's directory. Returns undefined when nothing
 * matches. Kept deliberately cheap (no network, no conversion): the caller decides the error.
 */
export async function resolvePack(ref: string, root: string): Promise<string | undefined> {
  const trimmed = ref.trim();
  if (trimmed.length === 0) return undefined;

  const candidates: string[] = [];
  // Absolute path, exact slug, then path-ish forms. `join` would glue an absolute
  // ref onto the root, so an absolute path is its own candidate.
  if (trimmed.includes(":") || trimmed.startsWith("/") || trimmed.startsWith("\\")) {
    candidates.push(trimmed);
  } else {
    candidates.push(join(root, trimmed));
    if (!trimmed.includes("/") && !trimmed.includes("\\")) {
      candidates.push(trimmed);
    }
  }

  for (const candidate of candidates) {
    if (await readPack(candidate)) return candidate;
  }

  // Source-string match: read every pack and compare the recorded source.
  const { readdir } = await import("node:fs/promises");
  let entries: string[];
  try {
    entries = await readdir(root, { withFileTypes: true }).then((dirents) =>
      dirents.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
    );
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    const manifest = await readPack(join(root, entry));
    if (manifest?.source === trimmed) return join(root, entry);
  }
  return undefined;
}
