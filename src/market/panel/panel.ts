/**
 * The panel: one overlay over the installed packs, list and detail. It is a plain pi-tui
 * `Component` — the rows come from `PanelDataSource`, the keys from `model.ts`, the lines
 * from `render.ts` — so nothing here writes a pack file or reads one directly.
 *
 * @author mystery4f <40482524+mystery4f@users.noreply.github.com>
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import {
  initialState,
  type PanelEffect,
  type PanelRow,
  type PanelState,
  reconcile,
  reduceKey,
  scrollToSelection,
} from "./model.ts";
import { type PackDetail, renderDetail, renderList } from "./render.ts";
import type { PanelDataSource } from "./source.ts";

/** Refresh period; an install from another session should show up without a reopen. */
const REFRESH_MS = 3000;

/** Rows drawn between the header and the footer, so the window and the scroll agree. */
const CHROME_LINES = 4;

export interface MarketPanelOptions {
  readonly tui: Pick<TUI, "requestRender">;
  readonly theme: Theme;
  /** Called once when the panel should close; pi then disposes the component. */
  readonly done: () => void;
  readonly source: PanelDataSource;
  /** Terminal height at draw time; the overlay shrinks, the terminal does not. */
  readonly height?: () => number;
  /** Refresh period in milliseconds; 0 disables the tick, letting tests drive refreshes. */
  readonly refreshMs?: number;
}

export class MarketPanel implements Component {
  private readonly tui: Pick<TUI, "requestRender">;
  private readonly theme: Theme;
  private readonly done: () => void;
  private readonly source: PanelDataSource;
  private readonly height: () => number;
  private readonly timer: ReturnType<typeof setInterval> | undefined;

  private state: PanelState = initialState([]);
  private detail: PackDetail | undefined;
  private notice: string | undefined;
  /** Width of the last frame, so the parts that are not rows cut against the same edge. */
  private width = 80;
  /** Lines the last frame drew, for the visible-row window. */
  private frameHeight = 24;
  /** Serialises async work so a keypress never races the refresh it started. */
  private pending: Promise<void> = Promise.resolve();

  constructor(options: MarketPanelOptions) {
    this.tui = options.tui;
    this.theme = options.theme;
    this.done = options.done;
    this.source = options.source;
    this.height = options.height ?? (() => 24);
    const refreshMs = options.refreshMs ?? REFRESH_MS;
    if (refreshMs > 0) {
      this.timer = setInterval(() => {
        this.enqueue(async () => {
          await this.reload();
          this.paint();
        });
      }, refreshMs);
      // Never hold the process open just because the panel is watching the directory.
      this.timer.unref?.();
    }
    this.enqueue(async () => {
      await this.reload();
      this.paint();
    });
  }

  /** Resolves once every queued action has finished; a seam for deterministic tests. */
  settle(): Promise<void> {
    return this.pending;
  }

  /** Stop the tick and close the overlay; `dispose` is what pi calls on the component. */
  dispose(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }

  invalidate(): void {
    this.paint();
  }

  handleInput(data: string): void {
    const step = reduceKey(this.state, data);
    this.state = step.state;
    this.paint();
    if (step.effect.kind === "none") return;
    this.enqueue(() => this.run(step.effect));
    this.paint();
  }

  render(width: number): string[] {
    this.width = Math.max(20, width);
    this.frameHeight = Math.max(8, this.height());
    return this.state.mode === "detail" ? this.detailLines() : this.listLines();
  }

  /** Row lines plus the notice and the confirmation prompt, both above the footer. */
  private listLines(): string[] {
    this.state = scrollToSelection(
      this.state,
      Math.max(1, Math.floor((this.frameHeight - CHROME_LINES) / 2)),
    );
    const lines = renderList(this.theme, this.state, this.width, this.frameHeight);
    return this.annotate(lines);
  }

  private detailLines(): string[] {
    const row = this.detailRow();
    if (row === undefined)
      return this.annotate(renderList(this.theme, this.state, this.width, this.frameHeight));
    const detail = this.detail ?? {
      source: "",
      adapter: "",
      prefix: "",
      commit: "",
      installedAt: "",
      updatedAt: "",
      skills: [],
      prompts: [],
    };
    const body = renderDetail(this.theme, row, detail, this.width);
    const footer = this.theme.fg("dim", "← back · alt+q close");
    return this.annotate([...body.slice(0, -1), footer]);
  }

  /** Put the notice and the pending removal just above the footer line. */
  private annotate(lines: string[]): string[] {
    const extra: string[] = [];
    if (this.state.confirming !== undefined) {
      extra.push(
        this.theme.fg("warning", `remove ${this.state.confirming}? enter confirms · esc cancels`),
      );
    }
    if (this.notice !== undefined) extra.push(this.theme.fg("dim", this.notice));
    if (extra.length === 0) return lines;
    const last = lines.at(-1);
    return last === undefined ? extra : [...lines.slice(0, -1), ...extra, last];
  }

  private detailRow(): PanelRow | undefined {
    const id = this.state.detailId;
    if (id === undefined) return undefined;
    return this.state.rows.find((row) => row.slug === id);
  }

  private paint(): void {
    this.tui.requestRender();
  }

  private enqueue(work: () => Promise<void>): void {
    this.pending = this.pending.then(work).catch((error: unknown) => {
      this.notice = (error as Error).message;
    });
  }

  private async reload(): Promise<void> {
    const rows = await this.source.list();
    const next = reconcile(this.state, rows);
    // The open detail rereads its manifest: an update from another session should show.
    this.state = next;
    if (next.mode === "detail" && next.detailId !== undefined) {
      this.detail = await this.source.detail(next.detailId);
    }
  }

  private async run(effect: PanelEffect): Promise<void> {
    switch (effect.kind) {
      case "close":
        this.dispose();
        this.done();
        return;
      case "open":
        this.detail = await this.source.detail(effect.slug);
        this.paint();
        return;
      case "update":
        await this.act(() => this.source.update(effect.slug));
        return;
      case "toggle":
        await this.act(() => this.source.toggle(effect.slug, effect.enabled));
        return;
      case "remove":
        await this.act(() => this.source.remove(effect.slug), "list");
        return;
      default:
        return;
    }
  }

  /** Run one change, say what it did, and reload so the row tells the truth again. */
  private async act(change: () => Promise<string>, backToList?: "list"): Promise<void> {
    try {
      this.notice = await change();
    } catch (error) {
      this.notice = (error as Error).message;
      this.paint();
      return;
    }
    if (backToList === "list") {
      this.state = { ...this.state, mode: "list", detailId: undefined };
    }
    await this.reload();
    this.paint();
  }
}

/** Build the panel for one `/market panel`; exported for the command and for tests. */
export function marketPanel(options: MarketPanelOptions): MarketPanel {
  return new MarketPanel(options);
}
