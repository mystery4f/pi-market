import { join } from "node:path";
import { writeJson } from "./pack.ts";

/**
 * The package pi loads for one pack (ADR 0001). It lives at the pack root so its resource paths
 * stay inside the package, and it declares nothing but the generated trees: skills and prompts are
 * the only resource types a market source produces.
 */
export interface BridgeManifest {
  name: string;
  version: string;
  private: true;
  pi: { skills: string[]; prompts: string[] };
}

export function bridgeManifest(slug: string): BridgeManifest {
  return {
    name: `pi-market-bridge-${slug}`,
    version: "0.0.0",
    private: true,
    pi: { skills: ["./generated/skills"], prompts: ["./generated/prompts"] },
  };
}

export function bridgePath(packDir: string): string {
  return join(packDir, "package.json");
}

export async function writeBridge(packDir: string, slug: string): Promise<string> {
  await writeJson(bridgePath(packDir), bridgeManifest(slug));
  return packDir;
}
