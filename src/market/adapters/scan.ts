import { access, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { CommandRef, SkillRef } from "./types.ts";

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** Parsed JSON, or `undefined` when the file is missing or not JSON — never a thrown install. */
export async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

/** Subdirectories of `dir` that look like a skill, in name order. A missing dir yields none. */
export async function scanSkills(dir: string): Promise<SkillRef[]> {
  let entries: string[];
  try {
    const dirents = await readdir(dir, { withFileTypes: true });
    entries = dirents.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }

  const skills: SkillRef[] = [];
  for (const name of entries.sort()) {
    const skillDir = join(dir, name);
    if (await exists(join(skillDir, "SKILL.md"))) skills.push({ name, dir: skillDir });
  }
  return skills;
}

/** Top-level `*.md` files of `dir`, in name order. Subdirectories are not commands (ADR 0002). */
export async function scanCommands(dir: string): Promise<CommandRef[]> {
  let entries: string[];
  try {
    const dirents = await readdir(dir, { withFileTypes: true });
    entries = dirents.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch {
    return [];
  }

  return entries
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => ({ name: name.slice(0, -".md".length), file: join(dir, name) }));
}
