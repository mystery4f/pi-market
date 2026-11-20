import { join, relative } from "node:path";
import { writeJson } from "./json.ts";

/**
 * The one package pi loads for every pack in the market (ADR 0005). It lives at the market root and
 * globs each pack's generated trees, so installing or removing a pack never edits settings.json.
 */
export interface MarketPackage {
  name: string;
  version: string;
  private: true;
  pi: { skills: string[]; prompts: string[] };
}

export function marketPackage(): MarketPackage {
  return {
    name: "pi-market-packs",
    version: "0.0.0",
    private: true,
    pi: { skills: ["./*/generated/skills"], prompts: ["./*/generated/prompts"] },
  };
}

export function marketPackagePath(root: string): string {
  return join(root, "package.json");
}

export async function writeMarketPackage(root: string): Promise<string> {
  await writeJson(marketPackagePath(root), marketPackage());
  return root;
}

/**
 * How settings.json names the market root: relative to the settings file, so the entry survives a
 * moved home directory and reads the same on every machine.
 */
export function marketEntry(settingsPath: string, root: string): string {
  const relativePath = relative(join(settingsPath, ".."), root);
  return relativePath.split("\\").join("/");
}
