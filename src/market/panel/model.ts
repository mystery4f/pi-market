/**
 * The panel's state and its reducer: every key becomes an effect the host runs.
 * Nothing here touches the disk or the TUI, so the whole key map is testable.
 *
 * @author mystery4f <40482524+mystery4f@users.noreply.github.com>
 */

import { matchesKey } from "@earendil-works/pi-tui";

/** One pack as the list draws it: the summary plus whether settings.json loads it. */
export interface PanelRow {
  slug: string;
  source: string;
  adapter: string;
  commit: string;
  pin?: string;
  skills: number;
  prompts: number;
  updatedAt: string;
  enabled: boolean;
}

export type PanelMode = "list" | "detail";

export interface PanelState {
  rows: readonly PanelRow[];
  mode: PanelMode;
  /** The pack under the cursor, by slug: the cursor survives a reload that reorders rows. */
  selectedId: string | undefined;
  /** First row drawn; kept in step with the selection so it never leaves the window. */
  top: number;
  /** The `/` filter, matched against slug, source and adapter. */
  filter: string;
  /** True while `/` holds the keys: letters go to the filter, not to the row actions. */
  searching: boolean;
  /** The pack that opened the detail page. */
  detailId: string | undefined;
  /** A slug whose removal waits for `enter`; `esc` cancels it. */
  confirming: string | undefined;
}

/** What a key asks the host to do; `none` is a redraw without an action. */
export type PanelEffect =
  | { kind: "none" }
  | { kind: "close" }
  | { kind: "open"; slug: string }
  | { kind: "update"; slug: string }
  | { kind: "toggle"; slug: string; enabled: boolean }
  | { kind: "remove"; slug: string };

/** A key plus its effect: the reducer returns both so the host runs one and draws the other. */
export interface PanelStep {
  state: PanelState;
  effect: PanelEffect;
}

/** The longest filter the panel keeps; longer input is dropped rather than truncated mid-word. */
export const FILTER_MAX_LENGTH = 48;

export function initialState(rows: readonly PanelRow[]): PanelState {
  return {
    rows,
    mode: "list",
    selectedId: rows[0]?.slug,
    top: 0,
    filter: "",
    searching: false,
    detailId: undefined,
    confirming: undefined,
  };
}

/** The rows the filter admits, in the order the store listed them. */
export function visibleRows(state: PanelState): PanelRow[] {
  const needle = state.filter.trim().toLowerCase();
  if (needle.length === 0) return [...state.rows];
  return state.rows.filter((row) =>
    `${row.slug} ${row.source} ${row.adapter}`.toLowerCase().includes(needle),
  );
}

export function selectedRow(state: PanelState): PanelRow | undefined {
  return visibleRows(state).find((row) => row.slug === state.selectedId);
}

/**
 * Keep the selection by slug after the rows changed, and move it to a neighbour when its
 * own row is gone: a filter that hides the selected pack must not leave the cursor nowhere.
 */
export function reconcile(state: PanelState, rows: readonly PanelRow[]): PanelState {
  const next: PanelState = { ...state, rows };
  const shown = visibleRows(next);
  if (shown.length === 0) return { ...next, selectedId: undefined, top: 0 };
  if (shown.some((row) => row.slug === next.selectedId)) return next;
  return { ...next, selectedId: shown[0]?.slug };
}

/** Move the cursor by `delta` rows, clamped to the visible list. */
export function moveCursor(state: PanelState, delta: number): PanelState {
  const shown = visibleRows(state);
  if (shown.length === 0) return state;
  const current = shown.findIndex((row) => row.slug === state.selectedId);
  const from = current === -1 ? 0 : current;
  const to = Math.min(shown.length - 1, Math.max(0, from + delta));
  return { ...state, selectedId: shown[to]?.slug };
}

/** Scroll the window so the selected row is inside `height` lines; a no-op when it already is. */
export function scrollToSelection(state: PanelState, height: number): PanelState {
  const shown = visibleRows(state);
  const index = shown.findIndex((row) => row.slug === state.selectedId);
  if (index === -1) return state;
  const rows = Math.max(1, height);
  const top = Math.min(Math.max(0, index - rows + 1), Math.max(0, index));
  if (index >= state.top && index < state.top + rows) return state;
  return { ...state, top };
}

/** Bracketed paste wraps the payload in `\x1b[200~` … `\x1b[201~`; the filter wants the text. */
/**
 * The bracketed-paste markers, built from a code point: a regex literal holding the raw
 * escape byte is what terminals send, and the linter refuses to keep one in source.
 */
const PASTE_MARKERS = new RegExp(`${String.fromCharCode(27)}\\[20[01]~`, "g");

/** Bracketed paste wraps the payload in markers; the filter only wants the text between them. */
export function stripPaste(data: string): string {
  return data.replace(PASTE_MARKERS, "");
}

/** A printable run typed into the filter: control bytes and lone escapes never join it. */
function typedText(data: string): string | undefined {
  const text = stripPaste(data);
  if (text.length === 0) return undefined;
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return undefined;
    out += char;
  }
  return out;
}

/** The reducer for the list: navigation, the row actions, and the `/` filter. */
export function reduceListKey(state: PanelState, data: string): PanelStep {
  if (matchesKey(data, "alt+q")) return { state, effect: { kind: "close" } };

  if (state.searching) return reduceSearchKey(state, data);

  if (matchesKey(data, "down")) return { state: moveCursor(state, 1), effect: { kind: "none" } };
  if (matchesKey(data, "up")) return { state: moveCursor(state, -1), effect: { kind: "none" } };

  const selected = selectedRow(state);
  if (matchesKey(data, "enter") && selected !== undefined) {
    return {
      state: { ...state, mode: "detail", detailId: selected.slug },
      effect: { kind: "open", slug: selected.slug },
    };
  }
  if (matchesKey(data, "/")) {
    return { state: { ...state, searching: true, filter: "" }, effect: { kind: "none" } };
  }
  if (matchesKey(data, "u") && selected !== undefined) {
    return { state, effect: { kind: "update", slug: selected.slug } };
  }
  if (matchesKey(data, "t") && selected !== undefined) {
    return { state, effect: { kind: "toggle", slug: selected.slug, enabled: !selected.enabled } };
  }
  if (matchesKey(data, "x") && selected !== undefined) {
    // Two steps on purpose: a removal that a stray `x` could start is not undoable.
    return { state: { ...state, confirming: selected.slug }, effect: { kind: "none" } };
  }
  return { state, effect: { kind: "none" } };
}

/** While `/` holds the keys the filter takes the characters, and `enter`/`esc` end it. */
function reduceSearchKey(state: PanelState, data: string): PanelStep {
  if (matchesKey(data, "esc")) {
    return { state: { ...state, searching: false, filter: "" }, effect: { kind: "none" } };
  }
  if (matchesKey(data, "enter")) {
    return { state: { ...state, searching: false }, effect: { kind: "none" } };
  }
  if (matchesKey(data, "backspace")) {
    const filter = state.filter.slice(0, Math.max(0, state.filter.length - 1));
    return { state: reconcile({ ...state, filter }, state.rows), effect: { kind: "none" } };
  }
  const text = typedText(data);
  if (text === undefined) return { state, effect: { kind: "none" } };
  if (state.filter.length + text.length > FILTER_MAX_LENGTH)
    return { state, effect: { kind: "none" } };
  return {
    state: reconcile({ ...state, filter: state.filter + text }, state.rows),
    effect: { kind: "none" },
  };
}

/** The reducer for the detail page: `left` goes back, and every list action still works. */
export function reduceDetailKey(state: PanelState, data: string): PanelStep {
  if (matchesKey(data, "alt+q")) return { state, effect: { kind: "close" } };
  if (matchesKey(data, "left") || matchesKey(data, "esc")) {
    return { state: { ...state, mode: "list", detailId: undefined }, effect: { kind: "none" } };
  }
  return reduceListKey(state, data);
}

/** The reducer for a pending removal: `enter` removes, `esc` cancels, alt+q still closes. */
export function reduceConfirmKey(state: PanelState, data: string): PanelStep {
  const slug = state.confirming;
  if (slug === undefined) return { state, effect: { kind: "none" } };
  if (matchesKey(data, "alt+q")) return { state, effect: { kind: "close" } };
  if (matchesKey(data, "enter")) {
    return { state: { ...state, confirming: undefined }, effect: { kind: "remove", slug } };
  }
  if (matchesKey(data, "esc")) {
    return { state: { ...state, confirming: undefined }, effect: { kind: "none" } };
  }
  return { state, effect: { kind: "none" } };
}

/** The one entry point the component calls: it picks the page's reducer by state. */
export function reduceKey(state: PanelState, data: string): PanelStep {
  if (state.confirming !== undefined) return reduceConfirmKey(state, data);
  if (state.mode === "detail") return reduceDetailKey(state, data);
  return reduceListKey(state, data);
}
