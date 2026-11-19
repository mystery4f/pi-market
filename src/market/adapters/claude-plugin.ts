import { join } from "node:path";
import { model, readPlugin } from "./plugin-files.ts";
import { exists, readJson } from "./scan.ts";
import type { ReadOptions, SourceAdapter, SourceModel } from "./types.ts";

const PLUGIN_FILE = join(".claude-plugin", "plugin.json");

/**
 * A single Claude Code plugin at the repository root: `.claude-plugin/plugin.json` beside
 * `skills/` and `commands/`. A marketplace entry pointing at a directory looks the same.
 */
export const claudePluginAdapter: SourceAdapter = {
  id: "claude-plugin",

  async detect(root) {
    if (!(await exists(join(root, PLUGIN_FILE)))) {
      return { matched: false, reason: "no .claude-plugin/plugin.json" };
    }
    return { matched: true, reason: "single plugin manifest" };
  },

  async read(root: string, options: ReadOptions = {}): Promise<SourceModel> {
    const manifest = await readJson<{ name?: string }>(join(root, PLUGIN_FILE));
    const plugin = await readPlugin(root, manifest?.name);
    const notes: string[] = [];

    if (options.plugins && !options.plugins.includes(plugin.name)) {
      return model(
        "claude-plugin",
        root,
        [],
        [`plugin ${options.plugins.join(", ")}: this source has only ${plugin.name}`],
      );
    }
    if (plugin.skills.length === 0 && plugin.commands.length === 0) {
      notes.push(`plugin ${plugin.name}: no skills or commands found`);
    }
    return model("claude-plugin", root, [plugin], notes);
  },
};
