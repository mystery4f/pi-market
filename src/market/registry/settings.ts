import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const NON_PATH = /^(npm:|git:|builtin:)/;

function isLocal(value: string): boolean {
  return !NON_PATH.test(value);
}

/**
 * The `settings.packages` array, read only.
 *
 * pi hands extensions a read-only copy of settings (`ExtensionAPI.getSettings()`) and exposes
 * no supported way to persist one, so this class parses and never writes: a bad write here
 * costs the user their whole config, and the market needs no entry at all — the extension's own
 * manifest reaches the packs through a relative glob (ADR 0006).
 */
export class SettingsStore {
  private readonly text: string;
  /** Why `JSON.parse` refused the file, or undefined when it is intact. */
  readonly parseError: string | undefined;

  private constructor(
    text: string,
    readonly filePath: string,
  ) {
    this.text = text;
    this.parseError = parseProblem(text);
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
    // A document pi itself refuses to parse is not a source of truth: report nothing rather
    // than hand the caller spans carved out of a broken file.
    if (this.parseError !== undefined) return [];
    return parseArray(this.text, "packages") ?? [];
  }

  /** The package list pi itself would load, from whatever scope this file covers. */
  packages(): string[] {
    return this.entries().filter((entry): entry is string => typeof entry === "string");
  }

  /** A local entry resolved the way pi resolves it: relative to this settings file. */
  private identity(value: string): string {
    return isLocal(value) ? resolve(dirname(this.filePath), value) : value;
  }

  /** True when this exact entry is already listed, comparing local paths by identity. */
  has(entry: string): boolean {
    const target = this.identity(entry);
    return this.packages().some((value) => this.identity(value) === target);
  }

  /** Rewrites `settings.json.bak-*` files beside this one, newest first. Never writes. */
  async backups(): Promise<string[]> {
    const folder = dirname(this.filePath);
    let names: string[];
    try {
      names = await readdir(folder);
    } catch {
      return [];
    }
    const found = names.filter((name) => name.startsWith(`${basenameOf(this.filePath)}.bak`));
    const stamped = await Promise.all(
      found.map(async (name) => ({
        path: resolve(folder, name),
        at: await mtime(resolve(folder, name)),
      })),
    );
    return stamped.sort((left, right) => right.at - left.at).map((item) => item.path);
  }
}

function basenameOf(path: string): string {
  const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return at === -1 ? path : path.slice(at + 1);
}

async function mtime(path: string): Promise<number> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return 0;
  }
}

function parseProblem(text: string): string | undefined {
  try {
    JSON.parse(text);
    return undefined;
  } catch (error) {
    return (error as Error).message;
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
