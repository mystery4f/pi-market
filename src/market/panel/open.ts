/**
 * `/market panel`: the overlay, and the one-line widget that says it exists once it closes.
 *
 * @author mystery4f <40482524+mystery4f@users.noreply.github.com>
 */

import type { ExtensionCommandContext, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { verbList } from "../commands.ts";
import { listPacks } from "../packs.ts";
import { marketDir } from "../paths.ts";
import { MarketPanel } from "./panel.ts";
import { marketSource } from "./source.ts";

/** The widget slot this package owns; one line above the editor, replaced in place. */
export const PANEL_WIDGET = "pi-market";

type PanelContext = Pick<ExtensionCommandContext, "mode" | "hasUI" | "ui">;

/** Open the panel, or say why this surface cannot: the plain list still works everywhere else. */
export async function openMarketPanel(ctx: PanelContext): Promise<void> {
  if (ctx.mode !== "tui" || !ctx.hasUI) {
    const result = await verbList();
    ctx.ui.notify(result.text, "info");
    return;
  }
  await ctx.ui.custom<void>(
    (tui, theme, _keybindings, done) =>
      new MarketPanel({
        tui,
        theme,
        done: () => done(undefined),
        source: marketSource(),
        height: () => tui.terminal.rows - 2,
      }),
    {
      overlay: true,
      overlayOptions: () => ({ width: "90%", maxHeight: "80%", margin: 1 }),
    },
  );
  await publishSummary(ctx.ui);
}

/**
 * Leave exactly one line behind: the panel is not a page the reader has to remember,
 * and an empty market is better off with no line at all than one saying zero.
 */
export async function publishSummary(ui: ExtensionUIContext): Promise<void> {
  try {
    const result = await listPacks(marketDir());
    if (result.packs.length === 0) {
      ui.setWidget(PANEL_WIDGET, undefined);
      return;
    }
    const count = result.packs.length;
    ui.setWidget(PANEL_WIDGET, [`${String(count)} market packs · /market panel`]);
  } catch {
    // A market root that cannot be read still gets the way back in.
    ui.setWidget(PANEL_WIDGET, ["/market panel"]);
  }
}
