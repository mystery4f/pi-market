import { basename, join } from "node:path";
import { readSource } from "./adapters/index.ts";
import { convert } from "./converter/convert.ts";
import { foldSegment } from "./converter/naming.ts";
import type { PackManifest } from "./packs.ts";
import { bridgePath, writeBridge } from "./registry/bridge.ts";
import { readPack, writePack } from "./registry/pack.ts";
import type { SettingsStore } from "./registry/settings.ts";

/** A source identifier reduced to the one directory name its pack lives in. */
export function slugFor(source: string): string {
  const trimmed = source.replace(/^git\+/, "").replace(/\.git$/, "");
  const withoutScheme = trimmed.replace(/^[a-z]+:\/\//, "").replace(/^github\.com\//, "");
  const withoutRef = withoutScheme.replace(/@[^/]+$/, "");
  const segments = withoutRef.split(/[/\\]/).filter((part) => part.length > 0);
  const isPath =
    withoutRef.includes("\\") || withoutRef.startsWith("/") || /^[a-zA-Z]:/.test(withoutRef);
  const last = isPath ? basename(withoutRef) : segments.slice(-2).join("-");
  return foldSegment(last.length === 0 ? basename(withoutRef) : last);
}

export interface InstallInput {
  /** What the user typed, normalised — recorded so `market update` can fetch it again. */
  source: string;
  /** Where the source tree is right now: a clone, or a local directory the user pointed at. */
  sourceDir: string;
  commit: string;
  ref?: string;
  /** Market root; the pack becomes `<root>/<slug>`. */
  root: string;
  settings: SettingsStore;
  adapter?: string;
  /** Only these plugins of the source; every plugin when omitted. */
  plugins?: readonly string[];
  pin?: string;
  /** Names the user already owns and no pack may take. */
  existing?: { skills?: readonly string[]; prompts?: readonly string[] };
  now?: () => Date;
}

export interface InstallOutcome {
  manifest: PackManifest;
  packDir: string;
  /** The file pi loads the pack through. */
  bridge: string;
}

/**
 * Install one source as one pack: read it, convert it, write the manifest, and register the bridge
 * package in settings. A re-install keeps `installedAt` and the pin, so an update reads as an update
 * rather than a fresh install.
 */
export async function installPack(input: InstallInput): Promise<InstallOutcome> {
  const slug = slugFor(input.source);
  const packDir = join(input.root, slug);
  const previous = await readPack(packDir);

  const model = await readSource(input.sourceDir, {
    ...(input.adapter === undefined ? {} : { adapter: input.adapter }),
    ...(input.plugins === undefined ? {} : { plugins: input.plugins }),
  });

  const result = await convert(model, {
    skillsDir: join(packDir, "generated", "skills"),
    promptsDir: join(packDir, "generated", "prompts"),
    ...(input.existing === undefined ? {} : { existing: input.existing }),
  });

  if (result.skills.length === 0 && result.commands.length === 0) {
    throw new Error(
      `${input.source} produced no skills or commands; nothing was installed (${result.errors
        .map((error) => `${error.source}: ${error.message}`)
        .join("; ")})`,
    );
  }

  const timestamp = (input.now?.() ?? new Date()).toISOString();
  const pin = input.pin ?? previous?.pin;
  const manifest: PackManifest = {
    slug,
    source: input.source,
    adapter: model.adapter,
    commit: input.commit,
    ...(input.ref === undefined ? {} : { ref: input.ref }),
    ...(pin === undefined ? {} : { pin }),
    installedAt: previous?.installedAt ?? timestamp,
    updatedAt: timestamp,
    plugins: model.plugins.map((plugin) => plugin.name),
    artifacts: {
      skills: result.skills.map((skill) => skill.name),
      prompts: result.commands.map((command) => command.name),
    },
    rewrites: [
      ...result.skills.flatMap((skill) =>
        skill.rewrites.map((rewrite) => ({ ...rewrite, where: `${skill.name}/SKILL.md` })),
      ),
      ...result.commands.flatMap((command) =>
        command.rewrites.map((rewrite) => ({ ...rewrite, where: command.name })),
      ),
    ],
    errors: result.errors,
  };

  await writePack(packDir, manifest);
  const bridge = bridgePath(packDir);
  await writeBridge(packDir, slug);
  await input.settings.addPack(packDir);

  return { manifest, packDir, bridge };
}
