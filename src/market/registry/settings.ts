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

  /** Every entry as written, including the object forms pi itself accepts. */
  entries(): unknown[] {
    return parseArray(this.text, "packages") ?? [];
  }

  /** The package list pi itself would load, from whatever scope this file covers. */
  packages(): string[] {
    return this.entries().filter((entry): entry is string => typeof entry === "string");
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
    this.text = setArray(this.text, "packages", [...this.entries(), entry]);
    assertParses(this.text, "addPack");
    await writeFile(this.filePath, this.text, "utf8");
  }

  async removePack(packDir: string): Promise<void> {
    const entry = entryFor(packDir);
    const all = this.entries();
    const kept = all.filter((item) => {
      if (typeof item !== "string") return true;
      return !(isLocal(item) ? entryFor(item) === entry : item === entry);
    });
    if (kept.length === all.length) return;
    this.text = setArray(this.text, "packages", kept);
    assertParses(this.text, "removePack");
    await writeFile(this.filePath, this.text, "utf8");
  }
}
/**
 * Locate the value of a top-level key that holds an array, by bracket depth: the `[` after the
 * key is matched to its own `]`, with strings skipped so a nested `[]` inside an entry cannot
 * end the array early. Returns the array's slice bounds inside `text`.
 */
function arrayBounds(text: string, key: string): { start: number; end: number } | undefined {
  const needle = `"${key}"`;
  const keyAt = text.indexOf(needle);
  if (keyAt === -1 || isInString(text, keyAt)) return undefined;

  const colon = text.indexOf(":", keyAt + needle.length);
  if (colon === -1) return undefined;
  const start = text.indexOf("[", colon);
  if (start === -1) return undefined;

  let depth = 0;
  let escaped = false;
  for (let at = start; at < text.length; at++) {
    const char = text[at] as string;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      const close = stringEnd(text, at);
      if (close === -1) return undefined;
      at = close;
      continue;
    }
    if (char === "[") depth++;
    else if (char === "]") {
      depth--;
      if (depth === 0) return { start, end: at + 1 };
    }
  }
  return undefined;
}

function isInString(text: string, at: number): boolean {
  let inside = false;
  for (let p = 0; p < at; p++) {
    const char = text[p];
    if (inside) {
      if (char === "\\") p++;
      else if (char === '"') inside = false;
    } else if (char === '"') inside = true;
  }
  return inside;
}

function stringEnd(text: string, open: number): number {
  for (let at = open + 1; at < text.length; at++) {
    const char = text[at];
    if (char === "\\") {
      at++;
      continue;
    }
    if (char === '"') return at;
  }
  return -1;
}

function parseArray(text: string, key: string): unknown[] | undefined {
  const bounds = arrayBounds(text, key);
  if (!bounds) return undefined;
  try {
    const value = JSON.parse(text.slice(bounds.start, bounds.end)) as unknown;
    return Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Re-serialise only the matched array; everything outside it stays byte for byte. */
function setArray(text: string, key: string, entries: unknown[]): string {
  const rendered = entries.map((item) => `    ${JSON.stringify(item)}`).join(",\n");
  const array = entries.length === 0 ? "[]" : `[\n${rendered}\n  ]`;
  const bounds = arrayBounds(text, key);
  if (bounds) return `${text.slice(0, bounds.start)}${array}${text.slice(bounds.end)}`;

  // The key does not exist yet: add it as the last member of the top-level object.
  const lastBrace = text.lastIndexOf("}");
  if (lastBrace === -1) return text;
  const head = text.slice(0, lastBrace);
  const bare = head.trim() === "" || head.trim() === "{";
  if (bare) return `{\n  "packages": ${array}\n}`;
  const eol = head.endsWith("\n") ? "" : "\n";
  return `${head}${eol},\n  "packages": ${array}\n${text.slice(lastBrace)}`;
}

/** Refuse to write a document that no longer parses: the array span must never eat the file. */
function assertParses(text: string, context: string): void {
  try {
    JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${context}: refusing to write settings.json, result does not parse (${(error as Error).message})`,
    );
  }
}
