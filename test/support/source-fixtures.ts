import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** The smallest recognisable source tree for each format. */
export interface SourceFixture {
  /** Root the adapter under test will be handed. */
  root: () => string;
}

export async function writeMarketplace(dir: string): Promise<string> {
  const root = join(dir, "mkt");
  await mkdir(join(root, ".claude-plugin"), { recursive: true });
  await mkdir(join(root, "pm-execution", "skills", "retro"), { recursive: true });
  await mkdir(join(root, "pm-execution", "skills", "grill"), { recursive: true });
  await mkdir(join(root, "pm-execution", "commands"), { recursive: true });
  await mkdir(join(root, "pm-execution", ".claude-plugin"), { recursive: true });
  await mkdir(join(root, "pm-strategy", "skills", "vision"), { recursive: true });

  await writeFile(
    join(root, ".claude-plugin", "marketplace.json"),
    JSON.stringify(
      {
        name: "test-market",
        version: "1.0.0",
        plugins: [
          { name: "pm-execution", source: "./pm-execution" },
          { name: "pm-strategy", source: "./pm-strategy", description: "strategy skills" },
          { name: "pm-remote", source: "https://example.invalid/pm-remote" },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    join(root, "pm-execution", ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "pm-execution", version: "2.0.0", description: "execution" }, null, 2),
    "utf8",
  );
  await writeFile(join(root, "pm-execution", "skills", "retro", "SKILL.md"), "# Retro\n", "utf8");
  await writeFile(join(root, "pm-execution", "skills", "grill", "SKILL.md"), "# Grill\n", "utf8");
  await writeFile(join(root, "pm-execution", "commands", "backlog.md"), "# Backlog\n", "utf8");
  await writeFile(join(root, "pm-execution", "commands", "qna.md"), "# QnA\n", "utf8");
  await writeFile(join(root, "pm-strategy", "skills", "vision", "SKILL.md"), "# Vision\n", "utf8");
  return root;
}

export async function writePlugin(dir: string): Promise<string> {
  const root = join(dir, "plugin");
  await mkdir(join(root, ".claude-plugin"), { recursive: true });
  await mkdir(join(root, "skills", "one"), { recursive: true });
  await mkdir(join(root, "commands"), { recursive: true });
  await writeFile(
    join(root, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "solo", version: "1.0.0" }, null, 2),
    "utf8",
  );
  await writeFile(join(root, "skills", "one", "SKILL.md"), "# One\n", "utf8");
  await writeFile(join(root, "commands", "run.md"), "# Run\n", "utf8");
  return root;
}

export async function writeBareSkills(dir: string): Promise<string> {
  const root = join(dir, "bare");
  await mkdir(join(root, "skills", "alpha"), { recursive: true });
  await mkdir(join(root, "skills", "beta"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "@me/toolbox" }, null, 2),
    "utf8",
  );
  await writeFile(join(root, "skills", "alpha", "SKILL.md"), "# Alpha\n", "utf8");
  await writeFile(join(root, "skills", "beta", "SKILL.md"), "# Beta\n", "utf8");
  return root;
}

export async function writeSingleSkill(dir: string): Promise<string> {
  const root = join(dir, "single");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "SKILL.md"), "# Single\n", "utf8");
  return root;
}
