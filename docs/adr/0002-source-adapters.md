# ADR 0002 — Source formats are adapters; every policy decision stays in the converter

Status: accepted (2026-11-19)

## Context

The first source to support is a Claude Code marketplace (`phuryn/pm-skills`): a `.claude-plugin/marketplace.json` naming plugins, each with `.claude-plugin/plugin.json`, `skills/<name>/SKILL.md` and `commands/*.md`. It is already clear this is one layout among several — a single Claude plugin repo, a bare repo with only `skills/`, a directory on disk, and later whatever Cursor or another tool ships.

The tempting shape is one detector function with `if` branches, or one module per format that produces pi artifacts directly. Both put the naming rule, the frontmatter mapping and the reference rewriting in N places, where they drift the first time one format needs a tweak.

## Decision

Two halves with a model between them:

```ts
interface SourceAdapter {
  readonly id: string;
  detect(root: string): Detection;                  // { matched: boolean; reason: string }
  read(root: string, options: ReadOptions): SourceModel;
}
```

`SourceModel` is neutral: plugins, each with skills and commands, each carrying its origin path and nothing pi-specific. The converter turns a `SourceModel` into generated artifacts and owns every policy: `<plugin>-<skill>` naming, collision refusal, prompt-frontmatter mapping, reference rewriting, tombstone tagging, and the rewrite log in `pack.json`.

Detection runs the registered adapters in a fixed order and takes the first match; the resolved `id` is recorded in `pack.json` so an update does not re-guess, and `--adapter <id>` overrides detection.

## Consequences

- A new format is one file plus one registry line. Its tests come free from the format seam (fixtures in, `SourceModel` out).
- Naming and rewriting can be changed once and apply to every format, including ones added later.
- An adapter must express its layout in the neutral model, even when that is lossy: a format whose commands take unusual frontmatter has nowhere to put it unless `CommandModel` grows a field. That is a deliberate cost — a field in the model is one place, a branch in the converter is N.
- Detection order is a real decision: a bare `skills/` repo also "looks like" a marketplace that lost its manifest, so the specific adapters are registered before the generic ones.

## Rejected

- **One pipeline per format.** Each format's quirks stay local, but naming and rewriting then exist five times, and the fifth copy is written by whoever adds the sixth format.
- **A single detector with `if` branches over the same neutral model.** The branches collapse into one file that must be read entirely to add a format, and every format's fixtures build the union of all layouts.
