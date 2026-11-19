import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SourceModel } from "../../../src/market/adapters/types.ts";
import { convert } from "../../../src/market/converter/convert.ts";
import { splitFrontmatter } from "../../../src/market/converter/frontmatter.ts";
import { withTempDir } from "../../support/fixtures.ts";

async function writeSource(dir: string): Promise<SourceModel> {
  const plugin = join(dir, "source", "pm-execution");
  await mkdir(join(plugin, "skills", "retro", "references"), { recursive: true });
  await mkdir(join(plugin, "skills", "moved", "assets"), { recursive: true });
  await mkdir(join(plugin, "commands"), { recursive: true });

  await writeFile(
    join(plugin, "skills", "retro", "SKILL.md"),
    [
      "---",
      "name: retro",
      'description: "Run a sprint retro"',
      "---",
      "",
      "# Retro",
      "",
      "Read [the template](references/template.md) then run `/write-prd`.",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(plugin, "skills", "retro", "references", "template.md"),
    "# Template\n",
    "utf8",
  );
  await writeFile(join(plugin, "skills", "retro", "scripts.sh"), "#!/bin/sh\necho hi\n", "utf8");
  await writeFile(
    join(plugin, "skills", "moved", "SKILL.md"),
    [
      "---",
      "name: moved",
      'description: "Moved to another repository"',
      "---",
      "",
      "# Moved skill has moved",
      "",
      "Install it there.",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(join(plugin, "skills", "moved", "assets", "note.txt"), "note\n", "utf8");
  await writeFile(
    join(plugin, "commands", "write-prd.md"),
    [
      "---",
      'description: "Write a PRD"',
      "argument-hint: <feature>",
      "---",
      "",
      "Write a PRD for $ARGUMENTS using Skill(retro).",
      "",
    ].join("\n"),
    "utf8",
  );

  return {
    adapter: "claude-marketplace",
    root: join(dir, "source"),
    notes: ["plugin pm-remote: source is not a local path; skipped"],
    plugins: [
      {
        name: "pm-execution",
        skills: [
          { name: "retro", dir: join(plugin, "skills", "retro") },
          { name: "moved", dir: join(plugin, "skills", "moved") },
        ],
        commands: [{ name: "write-prd", file: join(plugin, "commands", "write-prd.md") }],
      },
    ],
  };
}

describe("convert", () => {
  it("installs namespaced skills with their assets and a rewritten reference", async () => {
    await withTempDir(async (dir) => {
      const model = await writeSource(dir);
      const skillsDir = join(dir, "pack", "generated", "skills");
      const promptsDir = join(dir, "pack", "generated", "prompts");
      const result = await convert(model, { prefix: "pm-execution", skillsDir, promptsDir });

      expect(result.skills.map((skill) => skill.name)).toEqual([
        "pm-execution-retro",
        "pm-execution-moved",
      ]);
      expect(await readFile(join(skillsDir, "pm-execution-retro", "scripts.sh"), "utf8")).toContain(
        "echo hi",
      );

      const text = await readFile(join(skillsDir, "pm-execution-retro", "SKILL.md"), "utf8");
      const document = splitFrontmatter(text);
      expect(document.fields[0]).toEqual(["name", "pm-execution-retro"]);
      expect(document.body).toContain("pm-execution-retro/references/template.md)");
      expect(document.body).toContain("`/pm-execution-write-prd`");
    });
  });

  it("writes a command as a prompt template with its hint and namespaced body", async () => {
    await withTempDir(async (dir) => {
      const model = await writeSource(dir);
      const promptsDir = join(dir, "pack", "generated", "prompts");
      const result = await convert(model, {
        prefix: "pm-execution",
        skillsDir: join(dir, "s"),
        promptsDir,
      });

      expect(result.commands.map((command) => command.name)).toEqual(["pm-execution-write-prd"]);
      const document = splitFrontmatter(
        await readFile(join(promptsDir, "pm-execution-write-prd.md"), "utf8"),
      );
      expect(document.fields).toContainEqual(["argument-hint", "<feature>"]);
      expect(document.fields.map(([key]) => key)).toEqual(["description", "argument-hint"]);
      expect(document.body).toContain("$ARGUMENTS");
      expect(document.body).toContain("Skill(pm-execution-retro)");
    });
  });

  it("flags a tombstone skill but still installs it", async () => {
    await withTempDir(async (dir) => {
      const model = await writeSource(dir);
      const result = await convert(model, {
        prefix: "pm-execution",
        skillsDir: join(dir, "pack", "generated", "skills"),
        promptsDir: join(dir, "pack", "generated", "prompts"),
      });

      const moved = result.skills.find((skill) => skill.name === "pm-execution-moved");
      expect(moved?.tombstone).toBe(true);
      const retro = result.skills.find((skill) => skill.name === "pm-execution-retro");
      expect(retro?.tombstone).toBe(false);
    });
  });

  it("keeps a name the user already owns and installs the rest", async () => {
    await withTempDir(async (dir) => {
      const model = await writeSource(dir);
      const skillsDir = join(dir, "pack", "generated", "skills");
      const result = await convert(model, {
        prefix: "pm-execution",
        skillsDir,
        promptsDir: join(dir, "pack", "generated", "prompts"),
        existing: { skills: ["pm-execution-retro"] },
      });

      expect(result.skills.map((skill) => skill.name)).toEqual(["pm-execution-moved"]);
      expect(result.errors.some((error) => error.message.includes("already taken"))).toBe(true);
      await expect(
        readFile(join(skillsDir, "pm-execution-retro", "SKILL.md"), "utf8"),
      ).rejects.toThrow();
    });
  });

  it("lets a plugin ship a skill and a command under the same name", async () => {
    await withTempDir(async (dir) => {
      const plugin = join(dir, "source", "pm-strategy");
      await mkdir(join(plugin, "skills", "business-model"), { recursive: true });
      await mkdir(join(plugin, "commands"), { recursive: true });
      await writeFile(
        join(plugin, "skills", "business-model", "SKILL.md"),
        [
          "---",
          "name: business-model",
          "description: Sketch a model",
          "---",
          "",
          "# Model",
          "",
        ].join("\n"),
        "utf8",
      );
      await writeFile(
        join(plugin, "commands", "business-model.md"),
        ["---", "description: Draft a model", "---", "", "Draft it.", ""].join("\n"),
        "utf8",
      );
      const model: SourceModel = {
        adapter: "claude-marketplace",
        root: join(dir, "source"),
        notes: [],
        plugins: [
          {
            name: "pm-strategy",
            skills: [{ name: "business-model", dir: join(plugin, "skills", "business-model") }],
            commands: [
              { name: "business-model", file: join(plugin, "commands", "business-model.md") },
            ],
          },
        ],
      };

      const skillsDir = join(dir, "pack", "generated", "skills");
      const promptsDir = join(dir, "pack", "generated", "prompts");
      const result = await convert(model, { prefix: "pm-strategy", skillsDir, promptsDir });

      expect(result.errors).toEqual([]);
      expect(result.skills.map((skill) => skill.name)).toEqual(["pm-strategy-business-model"]);
      expect(result.commands.map((command) => command.name)).toEqual([
        "pm-strategy-business-model",
      ]);
      expect(await readFile(join(promptsDir, "pm-strategy-business-model.md"), "utf8")).toContain(
        "Draft it.",
      );
    });
  });

  it("carries the adapter notes into the error list", async () => {
    await withTempDir(async (dir) => {
      const model = await writeSource(dir);
      const result = await convert(model, {
        prefix: "pm-execution",
        skillsDir: join(dir, "pack", "generated", "skills"),
        promptsDir: join(dir, "pack", "generated", "prompts"),
      });
      expect(result.errors.some((error) => error.source === "claude-marketplace")).toBe(true);
    });
  });
});
