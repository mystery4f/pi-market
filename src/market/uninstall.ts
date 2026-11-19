import { rm } from "node:fs/promises";

/**
 * Remove a pack's directory and everything generated under it. The registry entry is the
 * caller's job: disable keeps the files, remove does not.
 */
export async function removePackDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
