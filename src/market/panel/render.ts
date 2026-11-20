/**
 * Drawing: the panel's lines, built from the state and the theme. Nothing here reads the
 * disk, so every layout can be checked at a fixed width.
 *
 * @author mystery4f <40482524+mystery4f@users.noreply.github.com>
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { footerFor } from "./keys.ts";
import { type PanelRow, type PanelState, visibleRows } from "./model.ts";

/** Pad to `width` by visible width, so a CJK slug or an emoji never shifts a column. */
function pad(text: string, width: number): string {
  const used = visibleWidth(text);
  if (used >= width) return truncateToWidth(text, width, "…", false);
  return text + " ".repeat(width - used);
}

/** A count in two columns, so a list of packs lines up on the numbers. */
function count(value: number): string {
  return String(value).padStart(2);
}

/**
 * The two lines one pack takes. A disabled pack is drawn dim and tagged `off`, so the
 * list itself says why a name the user installed is not answering.
 */
export function renderRow(theme: Theme, row: PanelRow, selected: boolean, width: number): string[] {
  const cursor = selected ? theme.fg("accent", "▸") : " ";
  const name = pad(row.slug, Math.max(8, Math.min(28, width - 26)));
  const counts = `${count(row.skills)} skills ${count(row.prompts)} prompts`;
  const head = `${cursor} ${theme.bold(selected ? theme.fg("accent", name) : name)} ${theme.fg("muted", counts)}`;
  const off = row.enabled ? "" : ` ${theme.fg("warning", "off")}`;
  const pin = row.pin === undefined ? "" : ` ${theme.fg("dim", `pinned@${row.pin.slice(0, 7)}`)}`;
  const meta = `  ${theme.fg("dim", `${row.adapter} ${row.commit.slice(0, 7)}`)}${pin}${off}`;
  return [truncateToWidth(head, width, "…", true), truncateToWidth(meta, width, "…", true)];
}

/** The line above the rows: how many packs, how many the filter lets through, and the filter. */
export function renderHeader(theme: Theme, state: PanelState, width: number): string {
  const shown = visibleRows(state).length;
  const total = state.rows.length;
  const counts =
    state.filter.length === 0
      ? `${String(total)} packs`
      : `${String(shown)}/${String(total)} packs`;
  const live = state.searching ? theme.fg("accent", `/${state.filter}█`) : "";
  const head = `${theme.fg("accent", "pi-market")} ${theme.fg("muted", counts)}`;
  return truncateToWidth([head, live].filter(Boolean).join("  "), width, "…", true);
}

/** The empty state and the "filter matched nothing" state read differently on purpose. */
export function renderEmpty(theme: Theme, state: PanelState): string[] {
  if (state.rows.length === 0) {
    return [
      theme.fg("muted", "No packs installed."),
      theme.fg("dim", "Ask the agent to run market_install, or type /market install <source>."),
    ];
  }
  return [
    theme.fg("warning", `No pack matches "${state.filter}".`),
    theme.fg("dim", "esc clears the filter."),
  ];
}

/** The list page: header, as many rows as fit, footer. */
export function renderList(
  theme: Theme,
  state: PanelState,
  width: number,
  height: number,
): string[] {
  const lines = [renderHeader(theme, state, width), ""];
  const shown = visibleRows(state);
  if (shown.length === 0) {
    lines.push(...renderEmpty(theme, state));
  } else {
    const room = Math.max(1, Math.floor((height - 4) / 2));
    for (const row of shown.slice(state.top, state.top + room)) {
      lines.push(...renderRow(theme, row, row.slug === state.selectedId, width));
    }
  }
  lines.push("");
  const footer =
    state.filter.length > 0 && !state.searching
      ? `${footerFor("list")} · esc clears`
      : footerFor("list");
  lines.push(theme.fg("dim", truncateToWidth(footer, width, "…", true)));
  return lines;
}

/** Wrap a comma-joined list to `width`, indenting continuations under the label. */
function wrapped(theme: Theme, label: string, items: readonly string[], width: number): string[] {
  const padLabel = " ".repeat(label.length + 2);
  const lines: string[] = [];
  let line = `${theme.fg("muted", label)}  `;
  let used = label.length + 2;
  if (items.length === 0) return [`${line}${theme.fg("dim", "none")}`];
  for (const item of items) {
    const piece = `${item}${item === items.at(-1) ? "" : ","}`;
    if (used + piece.length + 1 > width && used > label.length + 2) {
      lines.push(line);
      line = padLabel;
      used = padLabel.length;
    }
    line += piece;
    used += piece.length;
  }
  lines.push(line);
  return lines;
}

/** What a pack converted: the artefact names, read from the generated tree on each visit. */
export interface PackDetail {
  source: string;
  adapter: string;
  prefix: string;
  commit: string;
  ref?: string;
  pin?: string;
  installedAt: string;
  updatedAt: string;
  skills: readonly string[];
  prompts: readonly string[];
}

/**
 * The detail page: the registry record plus the artefact names read from the generated tree.
 * The rows are read-only on purpose — the pack is changed by the list's actions, and a page
 * that could also change it would be a second writer of the same registry.
 */
export function renderDetail(
  theme: Theme,
  row: PanelRow,
  detail: PackDetail,
  width: number,
): string[] {
  const lines: string[] = [];
  const state = row.enabled ? theme.fg("success", "enabled") : theme.fg("warning", "disabled");
  lines.push(`${theme.fg("accent", theme.bold(row.slug))} ${state}`);
  lines.push("");
  const field = (label: string, value: string) => `${theme.fg("muted", pad(label, 11))}${value}`;
  lines.push(field("source", row.source));
  lines.push(field("prefix", detail.prefix));
  lines.push(field("adapter", row.adapter));
  lines.push(field("commit", row.commit.slice(0, 10)));
  if (row.pin !== undefined) lines.push(field("pin", row.pin.slice(0, 7)));
  lines.push(field("installed", detail.installedAt));
  lines.push(field("updated", row.updatedAt));
  lines.push("");
  lines.push(...wrapped(theme, "skills", detail.skills, width));
  lines.push(...wrapped(theme, "prompts", detail.prompts, width));
  lines.push("");
  lines.push(theme.fg("dim", truncateToWidth(footerFor("detail"), width, "…", true)));
  return lines.map((line) => truncateToWidth(line, width, "…", true));
}
