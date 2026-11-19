import { execFile } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface FetchedSource {
  /** Working tree to read (a fresh clone for a remote source, the directory itself for a local one). */
  dir: string;
  commit: string;
  ref?: string;
}

/** What the user typed minus a trailing `@ref`; refs belong on the source, never in the URL. */
export function splitRef(source: string): { url: string; ref?: string } {
  const at = source.lastIndexOf("@");
  if (at <= 0) return { url: source };
  return { url: source.slice(0, at), ref: source.slice(at + 1) };
}

/**
 * A source is remote when it is a URL, a `git+` transport, or a bare `owner/repo` pair.
 * Anything that looks like a local path — drive letter, leading slash or dot, backslash — stays local.
 */
export function isRemoteSource(source: string): boolean {
  if (/^(https?|git|ssh):\/\//.test(source)) return true;
  if (/^git\+/.test(source)) return true;
  // Local shapes first: a drive letter would otherwise read as a scheme.
  if (/^[a-zA-Z]:[\\/]/.test(source)) return false;
  if (source.startsWith("/") || source.startsWith(".") || source.includes("\\")) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(source)) return true;
  return /^[^/\s]+\/[^/\s]+$/.test(source);
}

function gitExecArgs(args: string[], dir?: string): string[] {
  return [...(dir === undefined ? [] : ["-C", dir]), ...args];
}

async function git(args: string[], dir?: string): Promise<string> {
  const { stdout } = await execFileAsync("git", gitExecArgs(args, dir), {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout.trim();
}

async function remoteCommit(dir: string): Promise<string> {
  return git(["rev-parse", "HEAD"], dir);
}

/** A local, non-git directory still needs a commit stamp so update can tell content apart. */
async function localCommit(dir: string): Promise<string> {
  try {
    return await git(["rev-parse", "HEAD"], dir);
  } catch {
    const info = await stat(dir);
    return `local-${info.mtimeMs}`;
  }
}

function remoteUrl(source: string): string {
  const { url } = splitRef(source);
  const clean = url.replace(/^git\+/, "").replace(/\.git$/, "");
  if (/^https?:\/\//.test(clean)) return clean;
  return `https://github.com/${clean}`;
}

async function cloneFresh(url: string, dir: string): Promise<void> {
  await git(["clone", "--quiet", url, dir]);
}

async function updateClone(url: string, dir: string, ref?: string): Promise<void> {
  await git(["fetch", "--quiet", "origin", "--tags"], dir);
  const target = ref === undefined ? "FETCH_HEAD" : ref;
  await git(["checkout", "--quiet", target], dir);
  await git(["reset", "--hard", target], dir);
}

/**
 * Materialise a source into a working tree under `cacheRoot` and return where to read it from.
 * Network access uses the caller's own git configuration; nothing is injected.
 */
export async function fetchSource(source: string, cacheRoot: string): Promise<FetchedSource> {
  if (!isRemoteSource(source)) {
    const dir = resolve(source);
    return { dir, commit: await localCommit(dir) };
  }

  const slug = basename(resolve(source))
    .replace(/\.git$/, "")
    .replace(/(\.git)?$/, "");
  const { url, ref } = splitRef(source);
  const dir = await (async () => {
    const candidate = `${cacheRoot}/${sanitiseCacheName(slug)}`;
    await mkdir(cacheRoot, { recursive: true });
    try {
      await stat(candidate);
      await updateClone(remoteUrl(url), candidate, ref);
    } catch {
      await cloneFresh(remoteUrl(url), candidate);
    }
    return candidate;
  })();

  return { dir, commit: await remoteCommit(dir), ...(ref === undefined ? {} : { ref }) };
}

function sanitiseCacheName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
