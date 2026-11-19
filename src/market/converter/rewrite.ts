import { posix } from "node:path";

/** One reference that moved, recorded so `pack.json` can say what was changed. */
export interface Rewrite {
  from: string;
  to: string;
}

export interface RewriteContext {
  /** Installed name of a declared command, or `undefined` when the source does not declare it. */
  resolveCommand: (name: string) => string | undefined;
  /** Installed name of a declared skill; `plugin` narrows the lookup to one plugin's skills. */
  resolveSkill: (name: string, plugin?: string) => string | undefined;
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
  resolveCommand: (name: string) => string | undefined,
  rewrites: Rewrite[],
): string {
  return body.replace(
    /(^|[\s(`])[/]([a-z0-9][a-z0-9-]*)(?=[\s)`.,;:!?]|$)/gm,
    (whole, lead: string, name: string) => {
      const installed = resolveCommand(name);
      if (installed === undefined) return whole;
      const rewritten = `${lead}/${installed}`;
      rewrites.push({ from: `/${name}`, to: `/${installed}` });
      return rewritten;
    },
  );
}

/** `Skill(name)` and `Skill(plugin:name)` both become `Skill(<installed name>)`. */
export function rewriteSkillReferences(
  body: string,
  resolveSkill: (name: string, plugin?: string) => string | undefined,
  rewrites: Rewrite[],
): string {
  return body.replace(
    /Skill\(([a-z0-9-]+)(?::([a-z0-9-]+))?\)/g,
    (whole, first: string, second?: string) => {
      const installed = second === undefined ? resolveSkill(first) : resolveSkill(second, first);
      if (installed === undefined) return whole;
      const rewritten = `Skill(${installed})`;
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
  text = rewriteSlashReferences(text, context.resolveCommand, rewrites);
  text = rewriteSkillReferences(text, context.resolveSkill, rewrites);
  return { text, rewrites: dedupe(rewrites) };
}
