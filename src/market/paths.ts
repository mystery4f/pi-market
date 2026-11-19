import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The pi agent directory: `PI_CODING_AGENT_DIR` when set, `~/.pi/agent` otherwise.
 * Resolved once per call so a test can point it at a temporary directory.
 */
export function agentDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PI_CODING_AGENT_DIR?.trim();
  return override ? override : join(homedir(), ".pi", "agent");
}

/** The settings file this extension reads and writes, and nothing else. */
export function settingsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(agentDir(env), "settings.json");
}

/**
 * The directory every pack lives under. Sits beside the agent directory, not inside it:
 * packs are installable artifacts, and a `pi agent reset` must not be the same action as
 * uninstalling nine sources.
 */
export function marketDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PI_MARKET_DIR?.trim();
  if (override) return override;
  return join(agentDir(env), "..", "market");
}
