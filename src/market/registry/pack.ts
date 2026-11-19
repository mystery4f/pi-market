import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PackManifest } from "../packs.ts";

export const PACK_FILE = "pack.json";

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

export async function readPack(dir: string): Promise<PackManifest | undefined> {
  try {
    return JSON.parse(await readFile(join(dir, PACK_FILE), "utf8")) as PackManifest;
  } catch {
    return undefined;
  }
}

export async function writePack(dir: string, manifest: PackManifest): Promise<void> {
  await writeJson(join(dir, PACK_FILE), manifest);
}

/** Remove a pack and everything generated under it. */
export async function removePack(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
