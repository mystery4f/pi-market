import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { listPacks, type PackReadResult } from "./market/packs.ts";
import { marketDir } from "./market/paths.ts";

const MARKET_VERBS = [
  "list",
  "install",
  "update",
  "remove",
  "doctor",
  "disable",
  "enable",
] as const;

/** One line per pack, or the reason there is nothing to show. */
export function renderList(result: PackReadResult): string {
  const lines: string[] = [];
  if (result.packs.length === 0) {
    lines.push("No market packs installed. `market_install` with a source name to add one.");
  }
  for (const pack of result.packs) {
    const pin = pack.pin ? ` pinned at ${pack.pin}` : "";
    const errors = pack.errors > 0 ? `, ${pack.errors} skipped` : "";
    lines.push(
      `${pack.slug} — ${pack.skills} skills, ${pack.prompts} prompts${errors} (${pack.adapter}, ${pack.commit.slice(0, 7)}${pin})`,
    );
  }
  for (const problem of result.problems) {
    lines.push(`Unreadable pack: ${problem.path} — ${problem.message}`);
  }
  return lines.join("\n");
}

export default function marketExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "market_list",
    label: "Market: list installed sources",
    description:
      "List the Claude-format skill/command marketplaces installed into pi as market packs, with skill and prompt counts, adapter, commit and pin per source.",
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const root = marketDir();
      const result = await listPacks(root);
      return {
        content: [{ type: "text" as const, text: renderList(result) }],
        details: { root, packs: result.packs.length, problems: result.problems.length },
      };
    },
  });

  pi.registerCommand("market", {
    description: "Manage market packs: list, install, update, remove, doctor",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const [verb] = args.trim().split(/\s+/, 1);
      if (verb && !MARKET_VERBS.includes(verb as (typeof MARKET_VERBS)[number])) {
        ctx.ui.notify(`Unknown verb ${verb}. Verbs: ${MARKET_VERBS.join(", ")}`, "error");
        return;
      }
      // Every verb but `list` arrives in Phase 3; until then the bare command lists.
      const result = await listPacks(marketDir());
      ctx.ui.notify(renderList(result), "info");
    },
  });
}
