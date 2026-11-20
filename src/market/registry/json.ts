import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Write JSON through a temporary file, so a crash never leaves half a document behind. */
export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}
