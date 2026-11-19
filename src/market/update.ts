import { join } from "node:path";
import { installFromDir } from "./install.ts";
import type { PackManifest } from "./packs.ts";
import type { SettingsStore } from "./registry/settings.ts";
import { fetchSource } from "./source.ts";

export interface UpdateOutcome {
  packDir: string;
  commit: string;
  changed: boolean;
}

export interface UpdateOptions {
  root: string;
  cacheRoot: string;
  settings: SettingsStore;
  now?: () => Date;
}

/**
 * Re-fetch a pack's source and re-convert it in place when the commit moved. The pack keeps its
 * slug, its installedAt and its pin; a pin that is already met is not an error.
 */
export async function updatePack(
  pack: PackManifest,
  options: UpdateOptions,
): Promise<UpdateOutcome> {
  const fetched = await fetchSource(pack.source, options.cacheRoot);
  const commit = fetched.commit;

  if (pack.pin !== undefined && commit !== pack.pin) {
    throw new Error(
      `update would move ${pack.slug} to ${commit.slice(0, 8)}, past its pin ${pack.pin}`,
    );
  }

  if (commit === pack.commit) {
    return { packDir: join(options.root, pack.slug), commit, changed: false };
  }

  const outcome = await installFromDir({
    source: pack.source,
    sourceDir: fetched.dir,
    commit,
    ...(fetched.ref === undefined ? {} : { ref: fetched.ref }),
    root: options.root,
    settings: options.settings,
    ...(pack.pin === undefined ? {} : { pin: pack.pin }),
    now: options.now,
  });

  return { packDir: outcome.packDir, commit, changed: true };
}
