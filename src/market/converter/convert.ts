import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PluginModel, SourceModel } from "../adapters/types.ts";
import { field, joinFrontmatter, splitFrontmatter, unquote } from "./frontmatter.ts";
import { namespaced, segmentProblem } from "./naming.ts";
import { type Rewrite, rewriteBody } from "./rewrite.ts";
import { detectTombstone } from "./tombstone.ts";

export interface ConvertedSkill {
  /** Namespaced name, which is also the directory name. */
  name: string;
  sourceName: string;
  plugin: string;
  tombstone: boolean;
  dir: string;
  rewrites: Rewrite[];
}

export interface ConvertedCommand {
  name: string;
  sourceName: string;
  plugin: string;
  file: string;
  rewrites: Rewrite[];
}

/** A source entry that was read but not installed. Recorded, never thrown: one bad plugin must not
 * sink the rest of the install. */
export interface ConvertError {
  source: string;
  message: string;
}

export interface ConvertResult {
  skills: ConvertedSkill[];
  commands: ConvertedCommand[];
  errors: ConvertError[];
}

export interface ConvertOptions {
  /** Where skills are written; the parent of one directory per skill. */
  skillsDir: string;
  /** Where prompt templates are written; one `<name>.md` per command. */
  promptsDir: string;
  /** Names already used by the user's own skills and prompts, which never get overwritten. */
  existing?: { skills?: readonly string[]; prompts?: readonly string[] };
}

function slash(path: string): string {
  return path.replace(/\\/g, "/");
}

function sourceNames(model: SourceModel): { commandNames: Set<string>; skillNames: Set<string> } {
  const commandNames = new Set<string>();
  const skillNames = new Set<string>();
  for (const plugin of model.plugins) {
    for (const command of plugin.commands) commandNames.add(command.name);
    for (const skill of plugin.skills) skillNames.add(skill.name);
  }
  return { commandNames, skillNames };
}

/** Rewrite a skill in place: namespaced `name`, rewritten body, tombstone flag reported. */
async function convertSkill(
  plugin: PluginModel,
  skill: { name: string; dir: string },
  options: ConvertOptions,
  shared: { commandNames: Set<string>; skillNames: Set<string> },
  taken: Set<string>,
  errors: ConvertError[],
): Promise<ConvertedSkill | undefined> {
  const source = `${plugin.name}/${skill.name}`;
  const problem = segmentProblem(skill.name) ?? segmentProblem(plugin.name);
  if (problem) {
    errors.push({ source, message: `name ${problem}` });
    return undefined;
  }

  const name = namespaced(plugin.name, skill.name);
  if (taken.has(name)) {
    errors.push({ source, message: `${name} is already taken; skipped` });
    return undefined;
  }

  const dir = join(options.skillsDir, name);
  try {
    await cp(skill.dir, dir, { recursive: true, force: true });
  } catch (error) {
    errors.push({ source, message: `copy failed: ${(error as Error).message}` });
    return undefined;
  }

  const skillFile = join(dir, "SKILL.md");
  const document = splitFrontmatter(await readFile(skillFile, "utf8"));
  const description = unquote(field(document.fields, "description"));
  const { text, rewrites } = rewriteBody(document.body, {
    plugin: plugin.name,
    commandNames: shared.commandNames,
    skillNames: shared.skillNames,
    installedDir: slash(dir),
  });

  const fields: [string, string][] = [["name", name]];
  for (const [key, value] of document.fields) {
    if (key !== "name") fields.push([key, value]);
  }
  await writeFile(skillFile, joinFrontmatter(fields, text), "utf8");

  taken.add(name);
  return {
    name,
    sourceName: skill.name,
    plugin: plugin.name,
    tombstone: detectTombstone(description, text),
    dir,
    rewrites,
  };
}

/** A command becomes a prompt template: same body, pi frontmatter, namespaced file name. */
async function convertCommand(
  plugin: PluginModel,
  command: { name: string; file: string },
  options: ConvertOptions,
  shared: { commandNames: Set<string>; skillNames: Set<string> },
  taken: Set<string>,
  errors: ConvertError[],
): Promise<ConvertedCommand | undefined> {
  const source = `${plugin.name}/${command.name}`;
  const problem = segmentProblem(command.name) ?? segmentProblem(plugin.name);
  if (problem) {
    errors.push({ source, message: `name ${problem}` });
    return undefined;
  }

  const name = namespaced(plugin.name, command.name);
  if (taken.has(name)) {
    errors.push({ source, message: `${name} is already taken; skipped` });
    return undefined;
  }

  await mkdir(options.promptsDir, { recursive: true });
  const file = join(options.promptsDir, `${name}.md`);
  const document = splitFrontmatter(await readFile(command.file, "utf8"));
  const { text, rewrites } = rewriteBody(document.body, {
    plugin: plugin.name,
    commandNames: shared.commandNames,
    skillNames: shared.skillNames,
    installedDir: slash(options.promptsDir),
  });

  // pi names a prompt template after its file, so a `name` key would be dead weight: keep only the
  // two fields pi reads.
  const fields: [string, string][] = [];
  for (const key of ["description", "argument-hint"] as const) {
    const value = field(document.fields, key);
    if (value !== undefined) fields.push([key, value]);
  }
  await writeFile(file, joinFrontmatter(fields, text), "utf8");

  taken.add(name);
  return { name, sourceName: command.name, plugin: plugin.name, file, rewrites };
}

/**
 * Turn a source model into pi artefacts: one directory per skill, one prompt template per command,
 * every name namespaced, every reference rewritten. A single failing entry lands in `errors` and
 * the rest of the source still installs.
 */
export async function convert(model: SourceModel, options: ConvertOptions): Promise<ConvertResult> {
  const shared = sourceNames(model);
  // Skills and prompts live in separate namespaces in pi, so a plugin may ship both a
  // `business-model` skill and a `business-model` command: only same-kind names collide.
  const takenSkills = new Set<string>(options.existing?.skills ?? []);
  const takenCommands = new Set<string>(options.existing?.prompts ?? []);
  const errors: ConvertError[] = [];

  await rm(options.skillsDir, { recursive: true, force: true });
  await rm(options.promptsDir, { recursive: true, force: true });
  await mkdir(options.skillsDir, { recursive: true });

  const skills: ConvertedSkill[] = [];
  const commands: ConvertedCommand[] = [];
  for (const plugin of model.plugins) {
    for (const skill of plugin.skills) {
      const converted = await convertSkill(plugin, skill, options, shared, takenSkills, errors);
      if (converted) skills.push(converted);
    }
    for (const command of plugin.commands) {
      const converted = await convertCommand(
        plugin,
        command,
        options,
        shared,
        takenCommands,
        errors,
      );
      if (converted) commands.push(converted);
    }
  }

  for (const note of model.notes) errors.push({ source: model.adapter, message: note });
  return { skills, commands, errors };
}
