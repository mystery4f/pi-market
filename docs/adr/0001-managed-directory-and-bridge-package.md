# ADR 0001 — One managed directory per source, registered through a generated bridge package

Status: accepted (2026-11-19)

## Context

pi has no runtime API for registering a skill. A skill becomes visible only because pi scans something at startup: a directory listed in `settings.skills`, a glob in the same array, or a package's `pi.skills` manifest. An installed pack therefore has to make pi scan a directory this extension owns, without editing the places a user hand-writes their own skills.

Three candidate mechanisms existed, and they differ in what "installed" means and how an uninstall fails.

## Decision

A pack lives in `~/.pi/market/<source slug>/` and is registered by generating `bridge/package.json` inside it:

```json
{ "name": "pi-market-bridge-<slug>", "pi": { "skills": ["./../generated/skills"], "prompts": ["./../generated/prompts"] } }
```

The registry write is a single append of that directory's absolute path to `settings.packages`. Nothing else in `settings.json` is modified, and `settings.skills` / `settings.prompts` are never touched.

## Consequences

- Uninstall is: delete one directory, remove one array entry. There is no second place a file could survive.
- `pi list` already prints packages, so the user's existing command answers "what is loaded" without new tooling.
- A pack can be disabled by removing only its registry entry, leaving files and configuration intact.
- The generated `package.json` is ours, so its shape is a private contract: pi's manifest rules apply, the upstream repo's files are never edited.
- The bridge directory adds one relative hop (`./../generated/...`), so a moved pack must rewrite its own bridge file — an update does that anyway.

## Rejected

- **Glob entries in `settings.skills`** (`~/.pi/market/*/generated/skills`). One line registers every pack, which reads as simpler, but it makes registration implicit: a pack whose `generated/` was renamed, or a glob typo, silently loads nothing and nothing reports it. It also puts our paths in the array a user hand-maintains, which is exactly the file they are most likely to rewrite.
- **Copying artifacts into `~/.agents/skills`.** No settings change at all, but every imported skill then competes for a name in the user's own namespace, uninstall has to remember which files it wrote, and updating means diffing our files against files a human may have edited.
