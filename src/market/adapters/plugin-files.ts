import { basename, join, resolve } from "node:path";
import { isDirectory, readJson, scanCommands, scanSkills } from "./scan.ts";
import type { PluginModel, ReadOptions, SourceModel } from "./types.ts";

/** What one plugin declaration in a marketplace file may say about a plugin. */
export interface PluginEntry {
  name?: string;
  description?: string;
  version?: string;
  source?: unknown;
}

export interface PluginManifest {
  name?: string;
  description?: string;
  version?: string;
}

/** A plugin is a directory with `skills/`, `commands/` or both. Its name defaults to its dir. */
export async function readPlugin(dir: string, declaredName?: string): Promise<PluginModel> {
  const manifest = await readJson<PluginManifest>(join(dir, ".claude-plugin", "plugin.json"));
  const name = declaredName ?? manifest?.name ?? basename(dir);
  const [skills, commands] = await Promise.all([
    scanSkills(join(dir, "skills")),
    scanCommands(join(dir, "commands")),
  ]);

  return {
    name,
    ...(manifest?.description ? { description: manifest.description } : {}),
    ...(manifest?.version ? { version: manifest.version } : {}),
    skills: skills.map((skill) => ({ name: skill.name, dir: resolve(skill.dir) })),
    commands: commands.map((command) => ({ name: command.name, file: resolve(command.file) })),
  };
}

/**
 * Resolve the plugins a source declares. A declaration whose source is not a local path is
 * reported in `notes`: this version installs from the checkout it already has, and a remote
 * plugin source would mean a second fetch this design does not do.
 */
export async function readDeclaredPlugins(
  root: string,
  entries: readonly PluginEntry[],
  options: ReadOptions = {},
): Promise<{ plugins: PluginModel[]; notes: string[] }> {
  const wanted = options.plugins ? new Set(options.plugins) : undefined;
  const plugins: PluginModel[] = [];
  const notes: string[] = [];

  for (const entry of entries) {
    const name = entry.name;
    if (!name) {
      notes.push(`a plugin declaration has no name; skipped`);
      continue;
    }
    if (wanted && !wanted.has(name)) continue;
    if (typeof entry.source !== "string") {
      notes.push(`plugin ${name}: source is not a local path; skipped`);
      continue;
    }

    const dir = resolve(root, entry.source);
    if (!(await isDirectory(dir))) {
      notes.push(`plugin ${name}: directory ${dir} is missing; skipped`);
      continue;
    }
    const plugin = await readPlugin(dir, name);
    plugins.push({
      ...plugin,
      ...(entry.description ? { description: entry.description } : {}),
      ...(entry.version ? { version: entry.version } : {}),
    });
  }

  if (wanted) {
    const found = new Set(plugins.map((plugin) => plugin.name));
    for (const name of wanted) {
      if (!found.has(name) && !notes.some((note) => note.includes(`plugin ${name}:`))) {
        notes.push(`plugin ${name}: not declared by this source; skipped`);
      }
    }
  }

  return { plugins, notes };
}

export function model(
  adapter: string,
  root: string,
  plugins: PluginModel[],
  notes: string[],
): SourceModel {
  return { adapter, root: resolve(root), plugins, notes };
}
