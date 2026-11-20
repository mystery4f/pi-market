/**
 * Install a real source into a throwaway market and print what came out.
 *
 * The acceptance source is a Claude-format marketplace with skills and commands in every shape this
 * converter handles, so the counts here are the evidence `docs/verify.md` quotes.
 *
 *   npx jiti scripts/acceptance.ts /path/to/pm-skills
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { installSource } from "../src/market/install.ts";
import { readRegistry, scanPackDir } from "../src/market/packs.ts";
import { SettingsStore } from "../src/market/registry/settings.ts";

const source = process.argv[2];
if (source === undefined) {
  console.error("usage: npx jiti scripts/acceptance.ts <source-directory>");
  process.exit(1);
}

const work = join(import.meta.dirname, "..", ".tmp", "acceptance", "run");
const root = join(work, "market");
const settingsPath = join(work, "settings.json");

await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
await writeFile(settingsPath, '{\n  "model": "keep-me"\n}\n', "utf8");

const outcome = await installSource({
  source: resolve(source),
  prefix: "pm",
  cacheRoot: join(work, "cache"),
  root,
  settings: await SettingsStore.load(settingsPath),
  now: () => new Date("2026-11-20T00:00:00.000Z"),
});

const { record, packDir } = outcome;
const skillsDir = join(packDir, "generated", "skills");
const artifacts = await scanPackDir(packDir);
const skills = await readdir(skillsDir);
const prompts = await readdir(join(packDir, "generated", "prompts"));

/** Every rewrite has to have landed somewhere in the generated tree, or the record is a lie. */
const generated: string[] = [];
for (const name of skills) {
  generated.push(await readFile(join(skillsDir, name, "SKILL.md"), "utf8").catch(() => ""));
}
for (const name of prompts) {
  generated.push(
    await readFile(join(packDir, "generated", "prompts", name), "utf8").catch(() => ""),
  );
}
const corpus = generated.join(String.fromCharCode(10));
const unresolved: string[] = [];
for (const rewrite of outcome.rewrites) {
  if (!corpus.includes(rewrite.to)) unresolved.push(`${rewrite.from} -> ${rewrite.to}`);
}

/** A tombstone is a skill whose description says where it moved; it still installs. */
const tombstones: string[] = [];
for (const name of skills) {
  const body = await readFile(join(skillsDir, name, "SKILL.md"), "utf8").catch(() => "");
  if (/^description: "?Moved to/im.test(body)) tombstones.push(name);
}

const { registry } = await readRegistry(root);

const lines = [
  `source     ${record.source}`,
  `slug       ${record.slug} (${record.adapter}) prefix ${record.prefix}`,
  `plugins    ${outcome.plugins}`,
  `skills     ${artifacts.skills.length} (${skills.length} directories)`,
  `prompts    ${artifacts.prompts.length} (${prompts.length} files)`,
  `rewrites   ${outcome.rewrites.length}, unresolved ${unresolved.length}`,
  `tombstones ${tombstones.length}: ${tombstones.join(" ")}`,
  `errors     ${outcome.errors.length}`,
  `registry   ${registry.packs.map((pack) => pack.slug).join(", ")}`,
  ...outcome.errors.slice(0, 5).map((error) => `  ${error.source}: ${error.message}`),
  `package    ${outcome.packageFile}`,
  `settings   ${(await readFile(settingsPath, "utf8")).replace(/\s+/g, " ")}`,
];

console.log(lines.join("\n"));
console.log(unresolved.length === 0 ? "rewrites ok" : `rewrites broken: ${unresolved.join(", ")}`);
