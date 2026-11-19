import { join } from "node:path";
import { model, type PluginEntry, readDeclaredPlugins } from "./plugin-files.ts";
import { readJson } from "./scan.ts";
import type { ReadOptions, SourceAdapter, SourceModel } from "./types.ts";

interface MarketplaceFile {
  name?: string;
  version?: string;
  plugins?: PluginEntry[];
}

const MARKETPLACE_FILE = join(".claude-plugin", "marketplace.json");

/**
 * A Claude Code marketplace: `.claude-plugin/marketplace.json` naming plugins, each a directory
 * in the same checkout. This is the format most skill repositories ship.
 */
export const claudeMarketplaceAdapter: SourceAdapter = {
  id: "claude-marketplace",

  async detect(root) {
    const file = await readJson<MarketplaceFile>(join(root, MARKETPLACE_FILE));
    if (!file) return { matched: false, reason: "no .claude-plugin/marketplace.json" };
    if (!Array.isArray(file.plugins) || file.plugins.length === 0) {
      return { matched: false, reason: "marketplace.json declares no plugins" };
    }
    return { matched: true, reason: `marketplace ${file.name ?? "(unnamed)"}` };
  },

  async read(root: string, options: ReadOptions = {}): Promise<SourceModel> {
    const file = await readJson<MarketplaceFile>(join(root, MARKETPLACE_FILE));
    const { plugins, notes } = await readDeclaredPlugins(root, file?.plugins ?? [], options);
    return model("claude-marketplace", root, plugins, notes);
  },
};
