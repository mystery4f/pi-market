import { describe, expect, it } from "vitest";
import {
  field,
  joinFrontmatter,
  splitFrontmatter,
  unquote,
} from "../../../src/market/converter/frontmatter.ts";
import { detectTombstone } from "../../../src/market/converter/tombstone.ts";

describe("splitFrontmatter", () => {
  it("splits fields from the body", () => {
    const document = splitFrontmatter(
      '---\nname: retro\ndescription: "Do a retro"\n---\n\n# Retro\n',
    );
    expect(document.hasFrontmatter).toBe(true);
    expect(field(document.fields, "name")).toBe("retro");
    expect(unquote(field(document.fields, "description"))).toBe("Do a retro");
    expect(document.body).toBe("# Retro\n");
  });

  it("keeps a folded description on one field", () => {
    const document = splitFrontmatter(
      "---\ndescription: >\n  first line\n  second line\n---\nbody\n",
    );
    expect(document.fields).toHaveLength(1);
    expect(document.fields[0]?.[1]).toContain("first line");
  });

  it("treats a file without a leading block as body only", () => {
    const document = splitFrontmatter("# Title\n");
    expect(document.hasFrontmatter).toBe(false);
    expect(document.fields).toEqual([]);
    expect(document.body).toBe("# Title\n");
  });

  it("normalises CRLF", () => {
    const document = splitFrontmatter("---\r\nname: x\r\n---\r\nbody\r\n");
    expect(field(document.fields, "name")).toBe("x");
    expect(document.body).toBe("body\n");
  });
});

describe("joinFrontmatter", () => {
  it("round-trips a field list and body", () => {
    const text = joinFrontmatter(
      [
        ["name", "pm-execution-retro"],
        ["description", '"Do a retro"'],
      ],
      "# Retro\n",
    );
    expect(text).toBe('---\nname: pm-execution-retro\ndescription: "Do a retro"\n---\n\n# Retro\n');
    const document = splitFrontmatter(text);
    expect(field(document.fields, "name")).toBe("pm-execution-retro");
    expect(document.body).toBe("# Retro\n");
  });

  it("writes a body with no frontmatter as-is", () => {
    expect(joinFrontmatter([], "# Only body")).toBe("# Only body\n");
  });
});

describe("detectTombstone", () => {
  it("flags a description that starts with moved to", () => {
    expect(
      detectTombstone(
        "Moved to phuryn/product-engineering, where it is maintained in the ai-shipping plugin",
        "# Anything\n",
      ),
    ).toBe(true);
  });

  it("flags a heading that says the skill has moved", () => {
    expect(detectTombstone("A skill", "# Code Review has moved\n\nText.")).toBe(true);
  });

  it("does not flag an ordinary skill", () => {
    expect(detectTombstone("Facilitate a retrospective", "# Retro\n\nAsk what worked.\n")).toBe(
      false,
    );
  });
});
