import { basename, join } from "node:path";
import { model } from "./plugin-files.ts";
import { readJson, scanCommands, scanSkills } from "./scan.ts";
import type { ReadOptions, SourceAdapter, SourceModel } from "./types.ts";

/** `@scope/name` becomes `name`: the scope is a registry detail, not a plugin name. */
export function pluginNameFromPackage(root: string, manifest?: { name?: string }): string {
  const raw = manifest?.name?.trim();
  if (!raw) return basename(root);
  return raw.includes("/") ? (raw.split("/").pop() ?? basename(root)) : raw;
}

/**
 * A repository with skills but no Claude plugin framing: `skills/` at the root, optionally
 * `commands/`. The plugin name comes from `package.json`, else the directory name.
 */
export const bareSkillsAdapter: SourceAdapter = {
  id: "bare-skills",

  async detect(root) {
    const skills = await scanSkills(join(root, "skills"));
    if (skills.length === 0) return { matched: false, reason: "no skills/*/SKILL.md at the root" };
    return { matched: true, reason: `${skills.length} skill(s) under skills/` };
  },

  async read(root: string, options: ReadOptions = {}): Promise<SourceModel> {
    const manifest = await readJson<{ name?: string }>(join(root, "package.json"));
    const name = pluginNameFromPackage(root, manifest);

    if (options.plugins && !options.plugins.includes(name)) {
      return model(
        "bare-skills",
        root,
        [],
        [`plugin ${name}: the source names its plugin ${name}`],
      );
    }

    const [skills, commands] = await Promise.all([
      scanSkills(join(root, "skills")),
      scanCommands(join(root, "commands")),
    ]);
    return model("bare-skills", root, [{ name, skills, commands }], []);
  },
};
