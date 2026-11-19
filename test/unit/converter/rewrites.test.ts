import { describe, expect, it } from "vitest";
import { rewriteBody } from "../../../src/market/converter/rewrite.ts";

const context = {
  plugin: "pm-execution",
  commandNames: new Set(["backlog", "write-prd"]),
  skillNames: new Set(["retro"]),
  installedDir: "/pack/generated/skills/pm-execution-retro",
};

describe("rewriteBody", () => {
  it("points a relative link at the installed copy and keeps the anchor", () => {
    const { text, rewrites } = rewriteBody(
      "See [the template](./references/template.md#step-2) first.",
      context,
    );
    expect(text).toContain(
      "](/pack/generated/skills/pm-execution-retro/references/template.md#step-2)",
    );
    expect(rewrites).toHaveLength(1);
  });

  it("leaves URLs, anchors and absolute paths alone", () => {
    const body = [
      "[site](https://example.com/a)",
      "[jump](#install)",
      "[abs](/etc/passwd)",
      "[asset](images/x.png)",
    ].join("\n");
    const { text } = rewriteBody(body, context);
    expect(text).toContain("(https://example.com/a)");
    expect(text).toContain("(#install)");
    expect(text).toContain("(/etc/passwd)");
    expect(text).toContain("(/pack/generated/skills/pm-execution-retro/images/x.png)");
  });

  it("namespaces a slash reference to a declared command, including one inside parentheses", () => {
    const { text } = rewriteBody("Run `/backlog` or (/write-prd).", context);
    expect(text).toContain("`/pm-execution-backlog`");
    expect(text).toContain("(/pm-execution-write-prd)");
  });

  it("leaves a URL path and an undeclared command untouched", () => {
    const body = "Fetched from https://askone.org/api and `/unknown` stays.";
    const { text, rewrites } = rewriteBody(body, context);
    expect(text).toContain("https://askone.org/api");
    expect(text).toContain("`/unknown`");
    expect(rewrites).toHaveLength(0);
  });

  it("records each distinct change once, without the surrounding syntax", () => {
    const body = "Run `/backlog`, then `/backlog` again, then `/write-prd`.";
    const { rewrites } = rewriteBody(body, context);
    expect(rewrites).toEqual([
      { from: "/backlog", to: "/pm-execution-backlog" },
      { from: "/write-prd", to: "/pm-execution-write-prd" },
    ]);
  });

  it("namespaces Skill(name) and Skill(plugin:name)", () => {
    const { text } = rewriteBody("Use Skill(retro) then Skill(pm-execution:retro).", context);
    expect(text).toBe("Use Skill(pm-execution-retro) then Skill(pm-execution-retro).");
  });
});
