import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import {
  initialState,
  type PanelRow,
  type PanelState,
  reconcile,
  reduceKey,
  scrollToSelection,
  selectedRow,
  stripPaste,
  visibleRows,
} from "../../../src/market/panel/model.ts";
import { renderDetail, renderList, renderRow } from "../../../src/market/panel/render.ts";

/** The theme is only a text pass-through here: the layout is what these tests are about. */
const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

/** Raw terminal data, spelled by code point so the file stays free of control bytes. */
const ESC = String.fromCharCode(27);
const ENTER = String.fromCharCode(13);
const DOWN = `${ESC}[B`;
const UP = `${ESC}[A`;
const LEFT = `${ESC}[D`;
const ALT_Q = `${ESC}q`;

function row(overrides: Partial<PanelRow> = {}): PanelRow {
  return {
    slug: "pm-execution",
    source: "phuryn/pm-skills",
    adapter: "claude-marketplace",
    commit: "a1b2c3d4e5f6",
    skills: 2,
    prompts: 2,
    errors: 0,
    updatedAt: "2026-11-19T12:00:00.000Z",
    enabled: true,
    ...overrides,
  };
}

function state(overrides: Partial<PanelState> = {}): PanelState {
  return { ...initialState([row()]), ...overrides };
}

describe("/ filter", () => {
  it("takes the keys once / is pressed and drops control bytes", () => {
    let current = state();
    current = reduceKey(current, "/").state;
    expect(current.searching).toBe(true);
    for (const char of "exec") current = reduceKey(current, char).state;
    expect(current.filter).toBe("exec");
    expect(reduceKey(current, UP).state.filter).toBe("exec");
  });

  it("clears on esc and keeps the filter on enter", () => {
    const typed = state({ searching: true, filter: "pm" });
    expect(reduceKey(typed, ESC).state.filter).toBe("");
    expect(reduceKey(typed, ESC).state.searching).toBe(false);
    const kept = reduceKey(typed, ENTER).state;
    expect(kept.searching).toBe(false);
    expect(kept.filter).toBe("pm");
  });

  it("strips the bracketed-paste markers around the payload", () => {
    expect(stripPaste(`${ESC}[200~pm${ESC}[201~`)).toBe("pm");
  });

  it("narrows the rows and moves the selection off a hidden pack", () => {
    const rows = [row({ slug: "alpha" }), row({ slug: "beta", source: "other/repo" })];
    let current: PanelState = { ...initialState(rows), selectedId: "alpha", filter: "beta" };
    expect(visibleRows(current).map((item) => item.slug)).toEqual(["beta"]);
    current = reconcile(current, rows);
    expect(current.selectedId).toBe("beta");
    expect(selectedRow(current)?.slug).toBe("beta");
  });

  it("keeps the selection when the filter still shows it", () => {
    const rows = [row({ slug: "alpha" }), row({ slug: "alpaca", source: "other/repo" })];
    const current = reconcile({ ...initialState(rows), selectedId: "alpaca", filter: "alp" }, rows);
    expect(current.selectedId).toBe("alpaca");
  });
});

describe("cursor and effects", () => {
  it("moves the cursor with the arrows and clamps at both ends", () => {
    const rows = [row({ slug: "a" }), row({ slug: "b" })];
    let current = initialState(rows);
    current = reduceKey(current, DOWN).state;
    expect(current.selectedId).toBe("b");
    current = reduceKey(current, DOWN).state;
    expect(current.selectedId).toBe("b");
    current = reduceKey(current, UP).state;
    expect(current.selectedId).toBe("a");
  });

  it("opens the selected pack on enter", () => {
    const step = reduceKey(state(), ENTER);
    expect(step.effect).toEqual({ kind: "open", slug: "pm-execution" });
    expect(step.state.mode).toBe("detail");
  });

  it("asks for update and an inverted toggle", () => {
    expect(reduceKey(state(), "u").effect).toEqual({ kind: "update", slug: "pm-execution" });
    expect(reduceKey(state({ rows: [row({ enabled: false })] }), "t").effect).toEqual({
      kind: "toggle",
      slug: "pm-execution",
      enabled: true,
    });
  });

  it("removes only after a second key", () => {
    const pending = reduceKey(state(), "x");
    expect(pending.effect).toEqual({ kind: "none" });
    expect(pending.state.confirming).toBe("pm-execution");
    expect(reduceKey(pending.state, ENTER).effect).toEqual({
      kind: "remove",
      slug: "pm-execution",
    });
    const cancelled = reduceKey(pending.state, ESC).state;
    expect(cancelled.confirming).toBeUndefined();
    expect(reduceKey(cancelled, ENTER).effect).toEqual({
      kind: "open",
      slug: "pm-execution",
    });
  });

  it("closes on alt+q from every page", () => {
    const close = { kind: "close" };
    expect(reduceKey(state(), ALT_Q).effect).toEqual(close);
    expect(reduceKey(state({ mode: "detail", detailId: "pm-execution" }), ALT_Q).effect).toEqual(
      close,
    );
    expect(reduceKey(state({ confirming: "pm-execution" }), ALT_Q).effect).toEqual(close);
  });

  it("goes back from the detail page with left", () => {
    const detail = state({ mode: "detail", detailId: "pm-execution" });
    const back = reduceKey(detail, LEFT);
    expect(back.state.mode).toBe("list");
    expect(back.state.detailId).toBeUndefined();
  });

  it("scrolls the window only when the selection leaves it", () => {
    const rows = Array.from({ length: 6 }, (_, index) => row({ slug: `pack-${index}` }));
    const selected = { ...initialState(rows), selectedId: "pack-5" };
    expect(scrollToSelection(selected, 2).top).toBe(4);
    const visible = { ...initialState(rows), selectedId: "pack-1", top: 0 };
    expect(scrollToSelection(visible, 4).top).toBe(0);
  });
});

describe("layout", () => {
  it("draws the counts and marks a disabled pack", () => {
    const [head, meta] = renderRow(theme, row({ enabled: false }), true, 80);
    expect(head).toContain("pm-execution");
    expect(head).toContain("2 skills");
    expect(meta).toContain("off");
  });

  it("truncates every row to the frame width", () => {
    const wide = row({ slug: "a-very-long-pack-name-that-will-not-fit", source: "x".repeat(60) });
    for (const line of renderRow(theme, wide, false, 30)) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(30);
    }
  });

  it("says something different for an empty market and an empty filter", () => {
    const empty = renderList(theme, initialState([]), 60, 20).join("\n");
    const filtered = renderList(theme, state({ filter: "nothing" }), 60, 20).join("\n");
    expect(empty).toContain("No packs installed.");
    expect(filtered).toContain('No pack matches "nothing"');
    expect(filtered).not.toContain("No packs installed.");
  });

  it("keeps the footer inside the frame", () => {
    const lines = renderList(theme, state(), 40, 20);
    for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(40);
  });

  it("shows what a pack converted and what it refused", () => {
    const detail = renderDetail(
      theme,
      row({ errors: 1 }),
      {
        plugins: ["pm-execution"],
        skills: ["pm-execution-retro", "pm-execution-grill"],
        prompts: ["pm-execution-backlog"],
        errors: [{ source: "code-review", message: "moved upstream" }],
      },
      70,
    ).join("\n");
    expect(detail).toContain("pm-execution-retro");
    expect(detail).toContain("code-review: moved upstream");
    expect(detail).toContain("claude-marketplace");
  });
});
