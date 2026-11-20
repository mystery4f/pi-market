import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  verbDisable,
  verbDoctor,
  verbEnable,
  verbInstall,
  verbList,
  verbRemove,
  verbUpdate,
} from "./market/commands.ts";
import { openMarketPanel } from "./market/panel/open.ts";

const MARKET_VERBS = [
  "list",
  "install",
  "update",
  "remove",
  "doctor",
  "disable",
  "enable",
  "panel",
] as const;

const InstallParams = Type.Object({
  /** Source: a local path, an `owner/repo`, a git URL, or git+... — with an optional `@ref`. */
  source: Type.String(),
  /** Prefix every artefact name starts with: `pm` turns a `retro` skill into `pm-retro`. */
  prefix: Type.String(),
  /** Only these plugins of the source; every plugin when omitted. */
  plugins: Type.Optional(Type.Array(Type.String())),
  /** Force a specific adapter id instead of auto-detection. */
  adapter: Type.Optional(Type.String()),
});

const RefParams = Type.Object({
  /** The pack to act on; a slug or the source string it was installed from. */
  pack: Type.String(),
});

const UpdateParams = Type.Object({
  /** The pack to update; a slug or the source string it was installed from. Omit to update all. */
  pack: Type.Optional(Type.String()),
});

export default function marketExtension(pi: ExtensionAPI): void {
  // ——— diagnostics ———
  pi.registerTool({
    name: "market_list",
    label: "Market: list installed sources",
    description:
      "List the Claude-format skill/command marketplaces installed into pi as market packs, with skill and prompt counts, adapter, commit and pin per source.",
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_toolCallId, _params, _signal, _onUpdate) {
      const result = await verbList();
      return {
        content: [{ type: "text" as const, text: result.text }],
        details: result.details,
      };
    },
  });

  pi.registerTool({
    name: "market_doctor",
    label: "Market: check installed packs",
    description:
      "Check every installed market pack against the registry: a pack on disk without a registry entry, or a registry entry without a pack, is reported with the path it looked at.",
    parameters: Type.Object({}, { additionalProperties: false }),
    async execute(_toolCallId, _params, _signal, _onUpdate) {
      const result = await verbDoctor();
      return { content: [{ type: "text" as const, text: result.text }], details: result.details };
    },
  });

  // ——— mutation ———
  pi.registerTool({
    name: "market_install",
    label: "Market: install a source",
    description:
      "Fetch a Claude-format skill/command source (local path, owner/repo, git URL — optional @ref) and install it as a market pack: one managed directory, generated skills and prompts, and a bridge package registered in settings. A re-install keeps the pin and the install date.",
    parameters: InstallParams,
    async execute(_toolCallId, params, _signal, _onUpdate) {
      const result = await verbInstall(params);
      return {
        content: [{ type: "text" as const, text: result.text }],
        details: { ...result.details, installed: true },
      };
    },
  });

  pi.registerTool({
    name: "market_update",
    label: "Market: update a source",
    description:
      "Re-fetch one installed pack's source and re-convert it when the commit moved. Refuses to move past the pack's pin. Prints old and new commit when it changed.",
    parameters: UpdateParams,
    async execute(_toolCallId, params, _signal, _onUpdate) {
      const result = await verbUpdate(params.pack);
      return {
        content: [{ type: "text" as const, text: result.text }],
        details: result.details,
      };
    },
  });

  pi.registerTool({
    name: "market_remove",
    label: "Market: remove a source",
    description:
      "Remove one installed market pack: its directory and its registry entry. Generated skills and prompts stop loading from this session's next reload.",
    parameters: RefParams,
    async execute(_toolCallId, params, _signal, _onUpdate) {
      const result = await verbRemove(params.pack);
      return {
        content: [{ type: "text" as const, text: result.text }],
        details: result.details,
      };
    },
  });

  pi.registerTool({
    name: "market_disable",
    label: "Market: disable a source",
    description:
      "Keep a pack's files but drop its registry entry, so its skills and prompts stop loading. Use market_enable to bring it back.",
    parameters: RefParams,
    async execute(_toolCallId, params, _signal, _onUpdate) {
      const result = await verbDisable(params.pack);
      return {
        content: [{ type: "text" as const, text: result.text }],
        details: result.details,
      };
    },
  });

  pi.registerTool({
    name: "market_enable",
    label: "Market: enable a source",
    description: "Restore a disabled pack's registry entry so its skills and prompts load again.",
    parameters: RefParams,
    async execute(_toolCallId, params, _signal, _onUpdate) {
      const result = await verbEnable(params.pack);
      return {
        content: [{ type: "text" as const, text: result.text }],
        details: result.details,
      };
    },
  });

  // ——— the /market command family, backed by the same verbs ———
  pi.registerCommand("market", {
    description:
      "Manage market packs: panel (interactive list); list; install <source>; update [pack]; remove|disable|enable <pack>; doctor",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const [verb, ...rest] = args.trim().split(/\s+/);
      const known = verb === "" || MARKET_VERBS.includes(verb as (typeof MARKET_VERBS)[number]);
      if (!known) {
        ctx.ui.notify(`Unknown verb ${verb}. Verbs: ${MARKET_VERBS.join(", ")}.`, "error");
        return;
      }

      try {
        let result: Awaited<ReturnType<typeof verbList>>;
        switch (verb) {
          case "install": {
            const [source] = rest;
            const flags = firstFlag(rest.slice(1));
            const prefix = flags.prefix;
            if (!source || source.startsWith("-") || !prefix) {
              ctx.ui.notify(
                "Usage: /market install <source> --prefix pm [--plugins a,b] [--adapter id]",
                "error",
              );
              return;
            }
            result = await verbInstall({ source, prefix, ...flags });
            break;
          }
          case "update":
            result = await verbUpdate(rest[0]);
            break;
          case "remove":
            if (!rest[0]) {
              ctx.ui.notify("Usage: /market remove <pack>", "error");
              return;
            }
            result = await verbRemove(rest[0]);
            break;
          case "disable":
            if (!rest[0]) {
              ctx.ui.notify("Usage: /market disable <pack>", "error");
              return;
            }
            result = await verbDisable(rest[0]);
            break;
          case "enable":
            if (!rest[0]) {
              ctx.ui.notify("Usage: /market enable <pack>", "error");
              return;
            }
            result = await verbEnable(rest[0]);
            break;
          case "panel":
            await openMarketPanel(ctx);
            return;
          case "doctor":
            result = await verbDoctor();
            break;
          default:
            result = await verbList();
            break;
        }
        ctx.ui.notify(result.text, "info");
        if (changesArtefacts(verb ?? "", result.details)) {
          ctx.ui.notify("Reloading to pick the change up.", "info");
          // After reload the ctx above is stale, so nothing below may touch it.
          await ctx.reload().catch(() => undefined);
        }
      } catch (error) {
        ctx.ui.notify((error as Error).message, "error");
      }
    },
  });
}

/**
 * Whether a verb touched files pi only reads at startup, so this session has to
 * reload to see them. Read-only verbs and a no-op update leave the session be.
 */
function changesArtefacts(verb: string, details: Record<string, unknown>): boolean {
  if (verb === "install" || verb === "remove" || verb === "disable" || verb === "enable")
    return true;
  if (verb !== "update") return false;
  if (details.changed === true) return true;
  return typeof details.updated === "number" && details.updated > 0;
}

/** Turn `--plugins a,b --prefix pm --adapter x` into the verb args the installer expects. */
function firstFlag(rest: string[]): { plugins?: string[]; prefix?: string; adapter?: string } {
  const out: { plugins?: string[]; prefix?: string; adapter?: string } = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const value = rest[index + 1];
    if (token === "--plugins" && value) {
      out.plugins = value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      index += 1;
    } else if (token === "--prefix" && value) {
      out.prefix = value;
      index += 1;
    } else if (token === "--adapter" && value) {
      out.adapter = value;
      index += 1;
    }
  }
  return out;
}
