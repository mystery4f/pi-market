import { bareSkillsAdapter } from "./bare-skills.ts";
import { claudeMarketplaceAdapter } from "./claude-marketplace.ts";
import { claudePluginAdapter } from "./claude-plugin.ts";
import { localDirAdapter } from "./local-dir.ts";
import type { Detection, ReadOptions, SourceAdapter, SourceModel } from "./types.ts";

/**
 * Registration order is the detection order (ADR 0002): the more specific a format, the earlier
 * it sits, and `local-dir` matches anything so it stays last.
 */
export const ADAPTERS: readonly SourceAdapter[] = [
  claudeMarketplaceAdapter,
  claudePluginAdapter,
  bareSkillsAdapter,
  localDirAdapter,
];

export type DetectionResult =
  | { matched: true; adapter: SourceAdapter; reason: string }
  | { matched: false; reasons: { adapter: string; reason: string }[] };

/** The first adapter that claims `root`, with every rejection listed for `market_doctor`. */
export async function detectSource(root: string): Promise<DetectionResult> {
  const reasons: { adapter: string; reason: string }[] = [];
  for (const adapter of ADAPTERS) {
    const detection: Detection = await adapter.detect(root);
    if (detection.matched) return { matched: true, adapter, reason: detection.reason };
    reasons.push({ adapter: adapter.id, reason: detection.reason });
  }
  return { matched: false, reasons };
}

export function resolveAdapter(id: string): SourceAdapter | undefined {
  return ADAPTERS.find((adapter) => adapter.id === id);
}

/** Adapter ids in detection order, for an error message that tells the user what to pass. */
export function adapterIds(): string[] {
  return ADAPTERS.map((adapter) => adapter.id);
}

/** Read a source through a named adapter, or the first one that claims it. */
export async function readSource(
  root: string,
  options: ReadOptions & { adapter?: string } = {},
): Promise<SourceModel> {
  if (options.adapter) {
    const adapter = resolveAdapter(options.adapter);
    if (!adapter) {
      throw new Error(
        `Unknown adapter ${options.adapter}. Known adapters: ${adapterIds().join(", ")}`,
      );
    }
    return adapter.read(root, options);
  }

  const detected = await detectSource(root);
  if (!detected.matched) {
    const seen = detected.reasons.map((entry) => `${entry.adapter}: ${entry.reason}`).join("; ");
    throw new Error(`No adapter recognises ${root} (${seen})`);
  }
  return detected.adapter.read(root, options);
}
