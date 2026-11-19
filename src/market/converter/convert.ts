import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PluginModel, SourceModel } from "../adapters/types.ts";
import { field, joinFrontmatter, splitFrontmatter, unquote } from "./frontmatter.ts";
import { foldSegment, namespaced, segmentProblem } from "./naming.ts";
import { type Rewrite, rewriteBody } from "./rewrite.ts";
import { detectTombstone } from "./tombstone.ts";

export interface ConvertedSkill {
  /** Prefixed name, which is also the directory name. */
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
  /** Prefix the user configured for this source, applied to every artefact name. */
  prefix: string;
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

interface NamePlan {
  resolveCommand: (name: string) => string | undefined;
  resolveSkill: (name: string, plugin?: string) => string | undefined;
  nameOfCommand: (plugin: string, name: string) => string | undefined;
  nameOfSkill: (plugin: string, name: string) => string | undefined;
}

/** Plugin and entry names never contain a colon, so it separates the two halves of a key. */
function keyOf(plugin: string, name: string): string {
  return `${plugin}:${name}`;
}

/**
 * Names are `<prefix>-<entry name>` for every plugin of one source, so a marketplace whose plugins
 * are all `pm-*` installs `pm-retro`, not `pm-execution-retro`. Planning up front lets the reference
 * rewrites point at names this same run will install.
 */
function planNames(model: SourceModel, prefix: string): NamePlan {
  const head = foldSegment(prefix);
  const skills = new Set<string>();
  const commands = new Set<string>();
  for (const plugin of model.plugins) {
    for (const skill of plugin.skills) skills.add(keyOf(plugin.name, skill.name));
    for (const command of plugin.commands) commands.add(keyOf(plugin.name, command.name));
  }

  const lookup =
    (declared: Set<string>) =>
    (name: string, plugin?: string): string | undefined => {
      const declaredHere =
        plugin === undefined
          ? [...declared].some((key) => key.endsWith(`:${name}`))
          : declared.has(keyOf(plugin, name));
      if (!declaredHere || segmentProblem(name)) return undefined;
      return namespaced(head, name);
    };

  return {
    resolveCommand: lookup(commands),
    resolveSkill: lookup(skills),
    nameOfCommand: (plugin, name) => {
      const installed = commands.has(keyOf(plugin, name)) && !segmentProblem(name);
      return installed ? namespaced(head, name) : undefined;
    },
    nameOfSkill: (plugin, name) => {
      const installed = skills.has(keyOf(plugin, name)) && !segmentProblem(name);
      return installed ? namespaced(head, name) : undefined;
    },
  };
}

/** Rewrite a skill in place: prefixed `name`, rewritten body, tombstone flag reported. */
async function convertSkill(
  plugin: PluginModel,
  skill: { name: string; dir: string },
  options: ConvertOptions,
  plan: NamePlan,
  taken: Set<string>,
  errors: ConvertError[],
): Promise<ConvertedSkill | undefined> {
  const source = `${plugin.name}/${skill.name}`;
  const problem = segmentProblem(skill.name) ?? segmentProblem(plugin.name);
  if (problem) {
    errors.push({ source, message: `name ${problem}` });
    return undefined;
  }

  const name = plan.nameOfSkill(plugin.name, skill.name);
  if (name === undefined) {
    errors.push({ source, message: `${skill.name} cannot be part of a name; skipped` });
    return undefined;
  }
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
    resolveCommand: plan.resolveCommand,
    resolveSkill: plan.resolveSkill,
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

/** A command becomes a prompt template: same body, pi frontmatter, prefixed file name. */
async function convertCommand(
  plugin: PluginModel,
  command: { name: string; file: string },
  options: ConvertOptions,
  plan: NamePlan,
  taken: Set<string>,
  errors: ConvertError[],
): Promise<ConvertedCommand | undefined> {
  const source = `${plugin.name}/${command.name}`;
  const problem = segmentProblem(command.name) ?? segmentProblem(plugin.name);
  if (problem) {
    errors.push({ source, message: `name ${problem}` });
    return undefined;
  }

  const name = plan.nameOfCommand(plugin.name, command.name);
  if (name === undefined) {
    errors.push({ source, message: `${command.name} cannot be part of a name; skipped` });
    return undefined;
  }
  if (taken.has(name)) {
    errors.push({ source, message: `${name} is already taken; skipped` });
    return undefined;
  }

  await mkdir(options.promptsDir, { recursive: true });
  const file = join(options.promptsDir, `${name}.md`);
  const document = splitFrontmatter(await readFile(command.file, "utf8"));
  const { text, rewrites } = rewriteBody(document.body, {
    resolveCommand: plan.resolveCommand,
    resolveSkill: plan.resolveSkill,
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
 * every name carrying the configured prefix, every reference rewritten. A single failing entry lands
 * in `errors` and the rest of the source still installs.
 */
export async function convert(model: SourceModel, options: ConvertOptions): Promise<ConvertResult> {
  const plan = planNames(model, options.prefix);
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
      const converted = await convertSkill(plugin, skill, options, plan, takenSkills, errors);
      if (converted) skills.push(converted);
    }
    for (const command of plugin.commands) {
      const converted = await convertCommand(plugin, command, options, plan, takenCommands, errors);
      if (converted) commands.push(converted);
    }
  }

  for (const note of model.notes) errors.push({ source: model.adapter, message: note });
  return { skills, commands, errors };
}
