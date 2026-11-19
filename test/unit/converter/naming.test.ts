import { describe, expect, it } from "vitest";
import { foldSegment, namespaced, segmentProblem } from "../../../src/market/converter/naming.ts";

describe("segmentProblem", () => {
  it("accepts lowercase words joined by dashes", () => {
    expect(segmentProblem("pm-execution")).toBeUndefined();
    expect(segmentProblem("retro2")).toBeUndefined();
  });

  it("rejects a leading dash, capitals, spaces and an empty name", () => {
    expect(segmentProblem("-retro")).toContain("lowercase");
    expect(segmentProblem("Retro")).toContain("lowercase");
    expect(segmentProblem("two words")).toContain("lowercase");
    expect(segmentProblem("")).toBe("is empty");
  });

  it("rejects a name longer than the artefact limit", () => {
    expect(segmentProblem("a".repeat(65))).toContain("longer than 64");
  });
});

describe("namespaced", () => {
  it("prefixes the plugin and folds a foreign plugin name", () => {
    expect(namespaced("pm-execution", "retro")).toBe("pm-execution-retro");
    expect(namespaced("PM Execution", "retro")).toBe("pm-execution-retro");
    expect(namespaced("@scope/plugin", "retro")).toBe("scope-plugin-retro");
  });

  it("never yields a name shorter than one segment", () => {
    expect(foldSegment("---")).toBe("plugin");
  });
});
