import { join } from "node:path";
import { cacheRoot, doctor } from "./doctor.ts";
import { installSource } from "./install.ts";
import { listPacks, type PackManifest, type PackReadResult } from "./packs.ts";
import { marketDir, settingsPath } from "./paths.ts";
import { readPack } from "./registry/pack.ts";
import { resolvePack } from "./registry/resolve.ts";
import { SettingsStore } from "./registry/settings.ts";
import { removePackDir } from "./uninstall.ts";
import { updatePack } from "./update.ts";

/** What every verb produces: text for the tool content and for the command notify. */
export interface VerbResult {
  text: string;
  details: Record<string, unknown>;
}

/** Resolve a pack reference (slug, source string, or path) to its directory, or throw. */
async function requirePack(ref: string): Promise<string> {
  const packed = await resolvePack(ref, marketDir());
  if (!packed) throw new Error(`No pack matches ${ref}. Try \`market_list\` first.`);
  return packed;
}

export async function verbList(): Promise<VerbResult> {
  const root = marketDir();
  const result: PackReadResult = await listPacks(root);
  const lines: string[] = [];
  if (result.packs.length === 0) {
    lines.push("No market packs installed. `market_install` with a source name to add one.");
  }
  for (const pack of result.packs) {
    const pin = pack.pin ? ` pinned at ${pack.pin}` : "";
    const errors = pack.errors > 0 ? `, ${pack.errors} skipped` : "";
    lines.push(
      `${pack.slug} — ${pack.skills} skills, ${pack.prompts} prompts${errors} (${pack.adapter}, ${pack.commit.slice(0, 7)}${pin})`,
    );
  }
  for (const problem of result.problems) {
    lines.push(`Unreadable pack: ${problem.path} — ${problem.message}`);
  }
  return {
    text: lines.join("\n"),
    details: { root, packs: result.packs.length, problems: result.problems.length },
  };
}

export async function verbDoctor(): Promise<VerbResult> {
  const root = marketDir();
  const settings = await SettingsStore.load(settingsPath());
  const report = await doctor(root, settings);
  const text = report.ok ? "All market packs healthy." : report.lines.join("\n");
  return { text, details: { root, ok: report.ok, issues: report.issues } };
}

export interface InstallVerbArgs {
  source: string;
  plugins?: readonly string[];
  adapter?: string;
}

export async function verbInstall(args: InstallVerbArgs): Promise<VerbResult> {
  const settings = await SettingsStore.load(settingsPath());
  const outcome = await installSource({
    source: args.source,
    root: marketDir(),
    cacheRoot: cacheRoot(),
    settings,
    ...(args.plugins === undefined ? {} : { plugins: args.plugins }),
    ...(args.adapter === undefined ? {} : { adapter: args.adapter }),
  });
  const text = `${outcome.manifest.slug} installed (${outcome.manifest.plugins.length} plugins, ${outcome.manifest.artifacts.skills.length} skills, ${outcome.manifest.artifacts.prompts.length} prompts) at ${outcome.packDir}`;
  return { text, details: { packDir: outcome.packDir, manifest: outcome.manifest } };
}

export async function verbUpdate(ref?: string): Promise<VerbResult> {
  const root = marketDir();
  const settings = await SettingsStore.load(settingsPath());
  const target = ref === undefined ? await listPacks(root) : undefined;

  if (ref !== undefined) {
    const packDir = await requirePack(ref);
    const manifest = (await readPack(packDir)) as PackManifest;
    const outcome = await updatePack(manifest, { root, cacheRoot: cacheRoot(), settings });
    const text = outcome.changed
      ? `${outcome.packDir}: ${manifest.commit.slice(0, 7)} → ${outcome.commit.slice(0, 7)}`
      : `${outcome.packDir}: already at ${outcome.commit.slice(0, 7)}`;
    return { text, details: { packDir: outcome.packDir, changed: outcome.changed } };
  }

  // No target: update every installed pack, one line each.
  const lines: string[] = [];
  for (const pack of target?.packs ?? []) {
    const packDir = join(root, pack.slug);
    const manifest = (await readPack(packDir)) as PackManifest;
    try {
      const outcome = await updatePack(manifest, { root, cacheRoot: cacheRoot(), settings });
      lines.push(
        outcome.changed
          ? `${pack.slug}: ${manifest.commit.slice(0, 7)} → ${outcome.commit.slice(0, 7)}`
          : `${pack.slug}: already at ${manifest.commit.slice(0, 7)}`,
      );
    } catch (error) {
      lines.push(`${pack.slug}: ${(error as Error).message}`);
    }
  }
  return {
    text: lines.length === 0 ? "No packs to update." : lines.join("\n"),
    details: { updated: lines.length },
  };
}

export async function verbRemove(ref: string): Promise<VerbResult> {
  const settings = await SettingsStore.load(settingsPath());
  const packDir = await requirePack(ref);
  await settings.removePack(packDir);
  await removePackDir(packDir);
  return { text: `${packDir} removed`, details: { packDir } };
}

export async function verbDisable(ref: string): Promise<VerbResult> {
  const settings = await SettingsStore.load(settingsPath());
  const packDir = await requirePack(ref);
  await settings.removePack(packDir);
  return { text: `${packDir} disabled`, details: { packDir, disabled: true } };
}

export async function verbEnable(ref: string): Promise<VerbResult> {
  const settings = await SettingsStore.load(settingsPath());
  const packDir = await requirePack(ref);
  await settings.addPack(packDir);
  return { text: `${packDir} enabled`, details: { packDir, disabled: false } };
}
