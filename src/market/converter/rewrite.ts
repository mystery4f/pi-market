import { posix } from "node:path";

/** One reference that moved, recorded so `pack.json` can say what was changed. */
export interface Rewrite {
  from: string;
  to: string;
}

export interface RewriteContext {
  plugin: string;
  /** Command names declared by the source: only these are treated as slash references. */
  commandNames: ReadonlySet<string>;
  /** Skill names declared by the source, for `Skill(name)` cross-references. */
  skillNames: ReadonlySet<string>;
  /** Where the skill's own files were installed, absolute. */
  installedDir: string;
}

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** A link target this converter rewrites: relative to the skill, not a URL or an anchor. */
function isRelativeTarget(target: string): boolean {
  if (target.length === 0 || target.startsWith("#")) return false;
  if (target.startsWith("/") || target.startsWith("//")) return false;
  return !URL_SCHEME.test(target);
}

/**
 * Point a relative link at the file where it was installed. The anchor after `#` survives: it is
 * the reader's position inside the file, not part of the path.
 */
export function rewriteRelativeLinks(
  body: string,
  installedDir: string,
  rewrites: Rewrite[],
): string {
  return body.replace(/\]\(([^()\s]+)\)/g, (whole, target: string) => {
    if (!isRelativeTarget(target)) return whole;
    const hash = target.indexOf("#");
    const path = hash === -1 ? target : target.slice(0, hash);
    const anchor = hash === -1 ? "" : target.slice(hash);
    if (path.length === 0) return whole;

    const absolute = posix.join(installedDir.replace(/\\/g, "/"), path.replace(/^\.\//, ""));
    const rewritten = `](${absolute}${anchor})`;
    // The record names the target only, not the surrounding syntax: `` `]` `` and `` `)` `` are noise
    // when a reader wants to know which link moved.
    rewrites.push({ from: target, to: `${absolute}${anchor}` });
    return rewritten;
  });
}

/**
 * A slash reference becomes the namespaced command. Only a name the source actually declares is
 * touched, and only at a word start, so a URL path such as `https://x.dev/api` stays verbatim.
 */
export function rewriteSlashReferences(
  body: string,
  plugin: string,
  commandNames: ReadonlySet<string>,
  rewrites: Rewrite[],
): string {
  return body.replace(
    /(^|[\s(`])[/]([a-z0-9][a-z0-9-]*)(?=[\s)`.,;:!?]|$)/gm,
    (whole, lead: string, name) => {
      if (!commandNames.has(name)) return whole;
      const rewritten = `${lead}/${plugin}-${name}`;
      rewrites.push({ from: `/${name}`, to: `/${plugin}-${name}` });
      return rewritten;
    },
  );
}

/** `Skill(name)` and `Skill(plugin:name)` both become `Skill(<plugin>-<name>)`. */
export function rewriteSkillReferences(
  body: string,
  plugin: string,
  skillNames: ReadonlySet<string>,
  rewrites: Rewrite[],
): string {
  return body.replace(
    /Skill\(([a-z0-9-]+)(?::([a-z0-9-]+))?\)/g,
    (whole, first: string, second?: string) => {
      const name = second ?? first;
      if (!skillNames.has(name)) return whole;
      const rewritten = `Skill(${plugin}-${name})`;
      rewrites.push({ from: whole, to: rewritten });
      return rewritten;
    },
  );
}

/** One entry per distinct change: a reference used three times is still one thing to explain. */
function dedupe(rewrites: readonly Rewrite[]): Rewrite[] {
  const seen = new Set<string>();
  const unique: Rewrite[] = [];
  for (const rewrite of rewrites) {
    const key = JSON.stringify([rewrite.from, rewrite.to]);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(rewrite);
  }
  return unique;
}

/** Every reference rule in the order a reader would meet them. */
export function rewriteBody(
  body: string,
  context: RewriteContext,
): { text: string; rewrites: Rewrite[] } {
  const rewrites: Rewrite[] = [];
  let text = rewriteRelativeLinks(body, context.installedDir, rewrites);
  text = rewriteSlashReferences(text, context.plugin, context.commandNames, rewrites);
  text = rewriteSkillReferences(text, context.plugin, context.skillNames, rewrites);
  return { text, rewrites: dedupe(rewrites) };
}
