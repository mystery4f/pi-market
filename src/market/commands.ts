import { join } from "node:path";
import { cacheRoot, doctor } from "./doctor.ts";
import { installSource } from "./install.ts";
import {
  listPacks,
  type PackReadResult,
  type PackRecord,
  removePackRecord,
  resolvePack,
  scanPackDir,
} from "./packs.ts";
import { marketDir, settingsPath } from "./paths.ts";
import { SettingsStore } from "./registry/settings.ts";
import { setEnabled } from "./state.ts";
import { removePackDir } from "./uninstall.ts";
import { updatePack } from "./update.ts";

/** What every verb produces: text for the tool content and for the command notify. */
export interface VerbResult {
  text: string;
  details: Record<string, unknown>;
}

/** Resolve a pack reference (slug, source string, or path) to its record, or throw. */
async function requirePack(ref: string): Promise<PackRecord> {
  const record = await resolvePack(ref, marketDir());
  if (!record) throw new Error(`No pack matches ${ref}. Try \`market_list\` first.`);
  return record;
}

const toDir = (root: string, record: PackRecord): string => join(root, record.slug);
const short = (commit: string): string => commit.slice(0, 7);

export async function verbList(): Promise<VerbResult> {
  const root = marketDir();
  const result: PackReadResult = await listPacks(root);
  const lines: string[] = [];
  if (result.packs.length === 0) {
    lines.push("No market packs installed. `market_install` with a source name to add one.");
  }
  for (const pack of result.packs) {
    const pin = pack.pin ? ` pinned at ${pack.pin}` : "";
    lines.push(
      `${pack.slug} — ${pack.skills.length} skills, ${pack.prompts.length} prompts (${pack.prefix}, ${pack.adapter}, ${short(pack.commit)}${pin})`,
    );
  }
  for (const problem of result.problems) {
    lines.push(`${problem.message}${problem.path.length === 0 ? "" : `: ${problem.path}`}`);
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
  /** Every artefact name starts with `<prefix>-`; e.g. a marketplace whose plugins are all `pm-*`
   * installs `pm-retro` with `--prefix pm`. Required. */
  prefix: string;
  plugins?: readonly string[];
  adapter?: string;
}

export async function verbInstall(args: InstallVerbArgs): Promise<VerbResult> {
  const settings = await SettingsStore.load(settingsPath());
  const outcome = await installSource({
    source: args.source,
    prefix: args.prefix,
    root: marketDir(),
    cacheRoot: cacheRoot(),
    settings,
    ...(args.plugins === undefined ? {} : { plugins: args.plugins }),
    ...(args.adapter === undefined ? {} : { adapter: args.adapter }),
  });
  const runs = outcome.rewrites.length;
  const skipped = outcome.errors.length;
  const text = `${outcome.record.slug} installed (${outcome.plugins} plugins, ${outcome.skills} skills, ${outcome.prompts} prompts) at ${outcome.packDir}${runs === 0 ? "" : `; ${runs} references rewritten`}${skipped === 0 ? "" : `; ${skipped} entries skipped`}`;
  return {
    text,
    details: {
      packDir: outcome.packDir,
      record: outcome.record,
      rewrites: outcome.rewrites,
      errors: outcome.errors,
    },
  };
}

export async function verbUpdate(ref?: string): Promise<VerbResult> {
  const root = marketDir();
  const settings = await SettingsStore.load(settingsPath());

  if (ref !== undefined) {
    const record = await requirePack(ref);
    const outcome = await updatePack(record, { root, cacheRoot: cacheRoot(), settings });
    const text = outcome.changed
      ? `${record.slug}: ${short(record.commit)} → ${short(outcome.commit)}`
      : `${record.slug}: already at ${short(record.commit)}`;
    return { text, details: { packDir: outcome.packDir, changed: outcome.changed } };
  }

  // No target: update every installed pack, one line each.
  const result = await listPacks(root);
  const lines: string[] = [];
  for (const pack of result.packs) {
    try {
      const outcome = await updatePack(pack, { root, cacheRoot: cacheRoot(), settings });
      lines.push(
        outcome.changed
          ? `${pack.slug}: ${short(pack.commit)} → ${short(outcome.commit)}`
          : `${pack.slug}: already at ${short(pack.commit)}`,
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
  const record = await requirePack(ref);
  const packDir = toDir(marketDir(), record);
  await removePackRecord(marketDir(), record.slug);
  await removePackDir(packDir);
  return { text: `${packDir} removed`, details: { packDir } };
}

export async function verbDisable(ref: string): Promise<VerbResult> {
  const record = await requirePack(ref);
  await setEnabled(toDir(marketDir(), record), false);
  return { text: `${record.slug} disabled`, details: { slug: record.slug, disabled: true } };
}

export async function verbEnable(ref: string): Promise<VerbResult> {
  const record = await requirePack(ref);
  await setEnabled(toDir(marketDir(), record), true);
  return { text: `${record.slug} enabled`, details: { slug: record.slug, disabled: false } };
}

export async function verbDetail(ref: string): Promise<VerbResult> {
  const record = await requirePack(ref);
  const root = marketDir();
  const dir = toDir(root, record);
  const artifacts = await scanPackDir(dir);
  const lines = [
    `slug     ${record.slug}`,
    `source   ${record.source}`,
    `prefix   ${record.prefix}`,
    `adapter  ${record.adapter}`,
    `commit   ${record.commit}`,
    ...(record.ref === undefined ? [] : [`ref      ${record.ref}`]),
    ...(record.pin === undefined ? [] : [`pin      ${record.pin}`]),
    `installed ${record.installedAt}`,
    `updated   ${record.updatedAt}`,
    `skills   ${artifacts.skills.length}`,
    `prompts  ${artifacts.prompts.length}`,
  ];
  return {
    text: lines.join("\n"),
    details: { record, artifacts, dir },
  };
}
