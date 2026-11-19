/**
 * The panel's key map: one source of truth. The footer string and the tests derive from it;
 * nothing else hard-codes a key.
 */
export type PanelScope = "all" | "list" | "detail" | "confirmRemove";

export interface KeyMapEntry {
  key: string;
  label: string;
  scope: PanelScope;
}

export const KEY_MAP: readonly KeyMapEntry[] = [
  { key: "alt+q", label: "close", scope: "all" },
  { key: "down", label: "next", scope: "list" },
  { key: "up", label: "previous", scope: "list" },
  { key: "enter", label: "open details", scope: "list" },
  { key: "/", label: "filter", scope: "list" },
  { key: "u", label: "update", scope: "list" },
  { key: "t", label: "toggle", scope: "list" },
  { key: "x", label: "remove", scope: "list" },
  { key: "left", label: "back", scope: "detail" },
  { key: "enter", label: "confirm", scope: "confirmRemove" },
  { key: "esc", label: "cancel", scope: "confirmRemove" },
];

/** The footer for the current page, derived from the map, e.g. `alt+q close · down next`. */
export function footerFor(scope: PanelScope): string {
  const shown = KEY_MAP.filter((entry) => entry.scope === scope || entry.scope === "all");
  return shown.map((entry) => `${entry.key} ${entry.label}`).join(" · ");
}
