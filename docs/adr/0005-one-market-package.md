# ADR 0005 — One market package, registered once with a relative path

Status: superseded by ADR 0006 (2026-11-20) — one registration stands, but it is this extension's own package, not a separate market package

## Context

ADR 0001 gave every pack its own bridge `package.json` and one `settings.packages` entry per pack.
That works, but it puts a per-pack absolute path into a file the user hand-edits, and every install,
update, disable or remove rewrites that file. The user rejected the shape twice: a per-pack
`pack.json` inside each installed directory ("每个仓库都有这么一个文件"), and a per-pack path in
`settings.json` ("这个能不能不弄到 settings.json 中"), with the added constraint that whatever entry
remains must not be absolute.

pi has no runtime API for registering a skill, so something in a file pi reads at startup has to
point at the generated trees. The question is only what that something is and how often it changes.

## Decision

The market root holds one `package.json` that globs every pack's trees:

```json
{
  "name": "pi-market-packs",
  "private": true,
  "pi": {
    "skills": ["./*/generated/skills"],
    "prompts": ["./*/generated/prompts"]
  }
}
```

`settings.packages` carries one entry for the whole market, written **relative to the settings
file** (`../market` from `~/.pi/agent/settings.json`) and computed with `marketEntry(settingsPath,
root)`. Installing, updating or removing a pack never touches settings.json again.

A disabled pack is switched off without settings at all: its `generated` directory is renamed to
`generated.disabled`, so the glob stops matching. Enabling moves it back. `state.ts` owns that move;
`doctor` reports a pack whose entry is missing and any leftover per-pack absolute entry.

## Alternatives rejected

- **Keep one bridge package per pack.** Every install rewrites a user-owned file with an absolute
  path; a moved home directory or a second machine breaks it; the file shows entries the user never
  typed.
- **Declare the globs in pi-market's own package.json** (`../../../../market/*/generated/skills`).
  settings would then hold only the git source, but it leans on pi accepting manifest paths that
  escape the package root. If pi ever confines them, every installed skill silently disappears.
- **Register each pack in `settings.skills` with a glob.** Same rewrite problem plus a second
  namespace for the same information, and the glob has to be re-derived whenever a slug changes.
- **Disable by removing the settings entry.** No longer possible: there is only one entry for the
  whole market, so the switch has to live in the filesystem.

## Consequences

- settings.json changes once, by hand-equivalent action, and then stays stable.
- The market root is now a package in its own right; `market_doctor` must own the health of that
  single entry instead of checking every pack.
- A pack's visibility depends on a directory name (`generated` vs `generated.disabled`), so the
  glob pattern and `state.ts` have to be kept in step.
- The bridge name `pi-market-bridge-<slug>` is gone; `SettingsStore.manifestName` was removed with
  it.
