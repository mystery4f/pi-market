/**
 * Where the panel's rows come from: the installed packs, their artefacts, and the verbs that
 * change them. The panel never touches the disk itself, so a test can swap this out.
 *
 * @author mystery4f <40482524+mystery4f@users.noreply.github.com>
 */

import { join } from "node:path";
import { verbDisable, verbEnable, verbRemove, verbUpdate } from "../commands.ts";
import { findPack, listPacks, scanPackDir } from "../packs.ts";
import { marketDir } from "../paths.ts";
import { isEnabled } from "../state.ts";
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

/** The installed market root, as the panel's one source. */
export function marketSource(root: string = marketDir()): PanelDataSource {
  return {
    async list() {
      const result = await listPacks(root);
      // A pack is live while its generated tree still matches the market package's globs; a
      // disabled pack keeps that tree aside, so the check is a directory, not a settings entry.
      const states = await Promise.all(
        result.packs.map(async (pack) => isEnabled(join(root, pack.slug))),
      );
      return result.packs.map((pack, index) => {
        const row: PanelRow = {
          slug: pack.slug,
          source: pack.source,
          adapter: pack.adapter,
          commit: pack.commit,
          skills: pack.skills.length,
          prompts: pack.prompts.length,
          updatedAt: pack.updatedAt,
          enabled: states[index] === true,
        };
        return pack.pin === undefined ? row : { ...row, pin: pack.pin };
      });
    },

    async detail(slug) {
      const record = await findPack(root, slug);
      if (!record) return undefined;
      const artifacts = await scanPackDir(join(root, slug));
      return {
        source: record.source,
        adapter: record.adapter,
        prefix: record.prefix,
        commit: record.commit,
        ...(record.ref === undefined ? {} : { ref: record.ref }),
        ...(record.pin === undefined ? {} : { pin: record.pin }),
        installedAt: record.installedAt,
        updatedAt: record.updatedAt,
        skills: artifacts.skills,
        prompts: artifacts.prompts,
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
