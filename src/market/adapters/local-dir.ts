import { basename, join } from "node:path";
import { bareSkillsAdapter } from "./bare-skills.ts";
import { claudePluginAdapter } from "./claude-plugin.ts";
import { model } from "./plugin-files.ts";
import { exists, isDirectory, readJson } from "./scan.ts";
import type { ReadOptions, SourceAdapter, SourceModel } from "./types.ts";

/**
 * The fallback: a local directory that matches no published format. It is still installable when
 * it holds something recognisable — a plugin root, a `skills/` tree, or a single skill — and
 * otherwise reads as an empty model with a note saying what was looked for.
 */
export const localDirAdapter: SourceAdapter = {
  id: "local-dir",

  async detect(root) {
    if (!(await isDirectory(root))) return { matched: false, reason: `${root} is not a directory` };
    return { matched: true, reason: "local directory" };
  },

  async read(root: string, options: ReadOptions = {}): Promise<SourceModel> {
    const asPlugin = await claudePluginAdapter.detect(root);
    if (asPlugin.matched) {
      const source = await claudePluginAdapter.read(root, options);
      return model("local-dir", root, source.plugins, source.notes);
    }

    const asSkills = await bareSkillsAdapter.detect(root);
    if (asSkills.matched) {
      const source = await bareSkillsAdapter.read(root, options);
      return model("local-dir", root, source.plugins, source.notes);
    }

    if (await exists(join(root, "SKILL.md"))) {
      const manifest = await readJson<{ name?: string }>(join(root, "package.json"));
      const name = manifest?.name ?? basename(root);
      return model("local-dir", root, [{ name, skills: [{ name, dir: root }], commands: [] }], []);
    }

    return model(
      "local-dir",
      root,
      [],
      [`no .claude-plugin/plugin.json, no skills/*/SKILL.md and no SKILL.md at ${root}`],
    );
  },
};
