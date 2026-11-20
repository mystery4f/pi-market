import { rename, stat } from "node:fs/promises";
import { join } from "node:path";

/** The generated trees pi loads through the market package's globs. */
export const GENERATED_DIR = "generated";

/** Where a disabled pack's trees are kept: outside the glob, so pi stops loading them. */
export const DISABLED_DIR = "generated.disabled";

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** A pack is live while its generated trees still match the market package's globs. */
export async function isEnabled(packDir: string): Promise<boolean> {
  return exists(join(packDir, GENERATED_DIR));
}

/**
 * Turn one pack on or off without touching settings.json: the whole market is registered once, so
 * a pack is switched by moving its trees in or out of the glob's reach.
 */
export async function setEnabled(packDir: string, enabled: boolean): Promise<void> {
  const from = join(packDir, enabled ? DISABLED_DIR : GENERATED_DIR);
  const to = join(packDir, enabled ? GENERATED_DIR : DISABLED_DIR);
  if (!(await exists(from))) return;
  if (await exists(to)) {
    throw new Error(`${packDir} already holds a ${enabled ? GENERATED_DIR : DISABLED_DIR} tree`);
  }
  await rename(from, to);
}
