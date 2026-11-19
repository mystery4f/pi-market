import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isRemoteSource, splitRef } from "../../src/market/source.ts";

describe("splitRef", () => {
  it("pulls a trailing @ref off a remote source", () => {
    expect(splitRef("phuryn/pm-skills@main")).toEqual({ url: "phuryn/pm-skills", ref: "main" });
    expect(splitRef("https://github.com/a/b.git@v1.2.3")).toEqual({
      url: "https://github.com/a/b.git",
      ref: "v1.2.3",
    });
  });

  it("leaves local paths and plain names untouched", () => {
    expect(splitRef("C:\\work\\my-skills")).toEqual({ url: "C:\\work\\my-skills" });
    expect(splitRef("phuryn/pm-skills")).toEqual({ url: "phuryn/pm-skills" });
  });
});

describe("isRemoteSource", () => {
  it("accepts URLs, git transports and owner/repo pairs", () => {
    expect(isRemoteSource("https://github.com/phuryn/pm-skills")).toBe(true);
    expect(isRemoteSource("git+https://github.com/phuryn/pm-skills.git")).toBe(true);
    expect(isRemoteSource("ssh://git@github.com/phuryn/pm-skills")).toBe(true);
    expect(isRemoteSource("phuryn/pm-skills")).toBe(true);
  });

  it("keeps local paths local", () => {
    expect(isRemoteSource("C:\\work\\my-skills")).toBe(false);
    expect(isRemoteSource("D:/work/my-skills")).toBe(false);
    expect(isRemoteSource("./skills")).toBe(false);
    expect(isRemoteSource("/tmp/skills")).toBe(false);
    expect(isRemoteSource("my-skills")).toBe(false);
  });
});

describe("fetchSource (local only, network stays out of unit tests)", () => {
  it("resolves a local source and stamps the git commit when the tree is a repository", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const dir = join(await mkdtemp(join(tmpdir(), "pi-market-src-")), "repo");
    await mkdir(dir, { recursive: true });
    try {
      await run("git", ["init", "-q", dir]);
      await run("git", ["-C", dir, "config", "user.email", "t@t.invalid"]);
      await run("git", ["-C", dir, "config", "user.name", "test"]);
      await run("git", ["-C", dir, "commit", "-q", "--allow-empty", "-m", "init"]);

      const { fetchSource } = await import("../../src/market/source.ts");
      const fetched = await fetchSource(dir, join(dir, "..", "cache"));
      expect(fetched.dir).toBe(dir);
      expect(fetched.commit).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("stamps a content-based local id when the tree is not a repository", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "pi-market-src-")), "plain");
    await mkdir(dir, { recursive: true });
    try {
      const { fetchSource } = await import("../../src/market/source.ts");
      const fetched = await fetchSource(dir, join(dir, "..", "cache"));
      expect(fetched.commit).toMatch(/^local-/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
