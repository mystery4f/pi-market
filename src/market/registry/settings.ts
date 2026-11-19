import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const NON_PATH = /^(npm:|git:|builtin:)/;

/** A local package path (the only kind we ever write), resolved so identity is stable. */
export function entryFor(packDir: string): string {
  if (isAbsolute(packDir)) return packDir;
  return resolve(packDir);
}

function isLocal(value: string): boolean {
  return !NON_PATH.test(value);
}

/**
 * The `settings.packages` array, edited through the one key we own. Only the array's contents
 * are ours to change; the rest of the file is never touched.
 */
export class SettingsStore {
  private text: string;

  private constructor(
    text: string,
    readonly filePath: string,
  ) {
    this.text = text;
  }

  static async load(path: string): Promise<SettingsStore> {
    try {
      return new SettingsStore(await readFile(path, "utf8"), path);
    } catch {
      return new SettingsStore("{}", path);
    }
  }

  /** The package list pi itself would load, from whatever scope this file covers. */
  packages(): string[] {
    const array = parseArray(this.text, "packages");
    if (!array) return [];
    return array.filter((entry): entry is string => typeof entry === "string");
  }

  /** The bridge package name pi lists for one pack. */
  manifestName(slug: string): string {
    return `pi-market-bridge-${slug}`;
  }

  async addPack(packDir: string): Promise<void> {
    const entry = entryFor(packDir);
    const current = this.packages();
    const known = current.some((value) =>
      isLocal(value) ? entryFor(value) === entry : value === entry,
    );
    if (known) return;

    const array = parseArray(this.text, "packages");
    const next = array ? [...array.filter((item) => item !== null), entry] : [entry];
    this.text = setArray(this.text, "packages", next);
    await writeFile(this.filePath, this.text, "utf8");
  }

  async removePack(packDir: string): Promise<void> {
    const entry = entryFor(packDir);
    const current = this.packages();
    const kept = current.filter(
      (value) => !(isLocal(value) ? entryFor(value) === entry : value === entry),
    );
    if (kept.length === current.length) return;

    this.text = setArray(this.text, "packages", kept);
    await writeFile(this.filePath, this.text, "utf8");
  }
}

function parseArray(text: string, key: string): unknown[] | undefined {
  const match = new RegExp(`"${key}"\\s*:\\s*(\\[[\\s\\S]*?\\])`).exec(text);
  if (!match) return undefined;
  try {
    const value = JSON.parse((match[1] ?? "").replace(/,\s*\]\s*$/, "]")) as unknown;
    return Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Re-serialise only the matched array; everything outside it stays byte for byte. */
function setArray(text: string, key: string, entries: unknown[]): string {
  const pattern = new RegExp(`("${key}"\\s*:\\s*)\\[[\\s\\S]*?\\]`);
  const rendered = entries.map((item) => `    ${JSON.stringify(item)}`).join(",\n");
  const array = entries.length === 0 ? "[]" : `[\n${rendered}\n  ]`;

  if (pattern.test(text)) return text.replace(pattern, `$1${array}`);

  // The key does not exist yet: add it as the last member of the top-level object.
  const lastBrace = text.lastIndexOf("}");
  if (lastBrace === -1) return text;
  const head = text.slice(0, lastBrace);
  const bare = head.trim() === "" || head.trim() === "{";
  if (bare) return `{\n  "packages": ${array}\n}`;
  const eol = head.endsWith("\n") ? "" : "\n";
  return `${head}${eol},\n  "packages": ${array}\n${text.slice(lastBrace)}`;
}
