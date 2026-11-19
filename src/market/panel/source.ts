/**
 * Where the panel's rows come from: the installed packs, their manifests, and the verbs
 * that change them. The panel never touches the disk itself, so a test can swap this out.
 *
 * @author mystery4f <40482524+mystery4f@users.noreply.github.com>
 */

import { join } from "node:path";
import { verbDisable, verbEnable, verbRemove, verbUpdate } from "../commands.ts";
import { listPacks } from "../packs.ts";
import { marketDir, settingsPath } from "../paths.ts";
import { readPack } from "../registry/pack.ts";
import { entryFor, SettingsStore } from "../registry/settings.ts";
import type { PanelRow } from "./model.ts";
import type { PackDetail } from "./render.ts";

/** What the panel may read and ask for; `update`, `toggle` and `remove` return a notice line. */
export interface PanelDataSource {
  list(): Promise<PanelRow[]>;
  detail(slug: string): Promise<PackDetail | undefined>;
  update(slug: string): Promise<string>;
  toggle(slug: string, enabled: boolean): Promise<string>;
  remove(slug: string): Promise<string>;
}

const NON_PATH = /^(npm:|git:|builtin:)/;

/** The installed market root, as the panel's one source. */
export function marketSource(root: string = marketDir()): PanelDataSource {
  return {
    async list() {
      const [result, settings] = await Promise.all([
        listPacks(root),
        SettingsStore.load(settingsPath()),
      ]);
      // A pack is enabled when settings loads its own bridge directory; anything else in
      // the array (an npm package, another plugin) is not ours to interpret.
      const loaded = new Set(
        settings.packages().map((value) => (NON_PATH.test(value) ? value : entryFor(value))),
      );
      return result.packs.map((pack) => {
        const row: PanelRow = {
          slug: pack.slug,
          source: pack.source,
          adapter: pack.adapter,
          commit: pack.commit,
          skills: pack.skills,
          prompts: pack.prompts,
          errors: pack.errors,
          updatedAt: pack.updatedAt,
          enabled: loaded.has(entryFor(join(root, pack.slug))),
        };
        return pack.pin === undefined ? row : { ...row, pin: pack.pin };
      });
    },

    async detail(slug) {
      const manifest = await readPack(join(root, slug));
      if (!manifest) return undefined;
      return {
        plugins: manifest.plugins,
        skills: manifest.artifacts.skills,
        prompts: manifest.artifacts.prompts,
        errors: manifest.errors,
      };
    },

    async update(slug) {
      return (await verbUpdate(slug)).text;
    },

    async toggle(slug, enabled) {
      return (await (enabled ? verbEnable(slug) : verbDisable(slug))).text;
    },

    async remove(slug) {
      return (await verbRemove(slug)).text;
    },
  };
}
