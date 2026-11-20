/**
 * How pi finds the packs (ADR 0006). This extension's own package.json globs the market trees, so
 * settings.json needs nothing but the extension itself: the checkout sits five levels under `~/.pi`,
 * which puts `~/.pi/market` at `../../../../../market` from the package root. pi resolves manifest
 * paths relative to the root and allows `..`, so the globs reach the packs without a second entry.
 */
export const MARKET_SKILLS_GLOB = "../../../../../market/*/generated/skills";
export const MARKET_PROMPTS_GLOB = "../../../../../market/*/generated/prompts";

/** The skills and prompts this package declares, as pi reads them out of package.json. */
export function manifestResources(): { skills: string[]; prompts: string[] } {
  return { skills: [MARKET_SKILLS_GLOB], prompts: [MARKET_PROMPTS_GLOB] };
}

/**
 * The entry the whole market is reachable through. It is this extension's own package, so the value
 * is the one a user installs with; doctor reports it when it is missing.
 */
export const EXTENSION_SOURCE = "pi-market";

/** True when settings.json loads something that can reach the packs. */
export function reachesPacks(entries: readonly string[]): boolean {
  return entries.some((entry) => entry.includes(EXTENSION_SOURCE));
}
