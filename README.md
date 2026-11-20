# pi-market

Install skill and command marketplaces written for Claude Code into pi — as a **managed pack** under `~/.pi/market/`, never mixed into your own `~/.agents/skills` or `~/.pi/agent/prompts`.

A source can be a Claude marketplace repo, a single plugin inside one, a repo that just has a `skills/` folder, or a directory on disk. The extension fetches it, converts skills and commands into what pi loads, and records the result in one `market.json` beside the packs. pi reads the whole market through a single package entry, so installing or removing a pack never edits your settings.

## Status

Working end to end against [phuryn/pm-skills](https://github.com/phuryn/pm-skills): 9 plugins, 72 skills, 42 commands, no errors. Adapters, converter, installer, the seven tools, every `/market` verb and the panel are in. Tracked in [issue #1](https://github.com/mystery4f/pi-market/issues/1); the scope and its acceptance lines live in `docs/scope.md`, the measured run in `docs/verify.md`.

## Install

pi loads a git package without copying it, so a checkout works directly:

```
pi install git:github.com/mystery4f/pi-market
```

Reload pi after changing its own source (`/reload`).

## Layout

| Path | Holds |
|---|---|
| `~/.pi/market/<source-slug>/` | one directory per installed source |
| `…/sources/` | the fetched source tree, kept so an update can diff and reconcile |
| `…/generated/skills/`, `…/generated/prompts/` | converted artifacts pi loads; disposable, rebuilt on update. A disabled pack keeps them as `generated.disabled/`, out of the glob's reach |
| `~/.pi/market/market.json` | the one registry: source, prefix, adapter, commit, pin, timestamps per pack |
| `~/.pi/market/package.json` | the one package pi loads: globs `*/generated/skills` and `*/generated/prompts` |
| `settings.json` | one relative entry, `../market` — written once, never touched by installs |

Every artifact name starts with the prefix you install with (`--prefix pm` → `pm-retro`). See `GLOSSARY.md` for the vocabulary and `docs/adr/` for the decisions.

## Commands and tools

| Surface | Does |
|---|---|
| `market_list` | installed sources with counts, adapter, commit, pin |
| `market_install` | add a source, optionally a subset of its plugins |
| `market_update` | fetch again, reconvert, reconcile removed artifacts |
| `market_remove` | uninstall a pack: drop its record and its directory |
| `market_disable` / enable | move `generated/` to `generated.disabled/` and back, keeping every file |
| `market_doctor` | find a missing market entry, a leftover per-pack entry, or a half-present pack |
| `/market` | the same verbs, plus a panel to browse and press keys in |

## Development

```
npm install
npm run verify     # check + lint + test
```

Requires Node `>=22.19.0`. Tests are split into `test/unit` (pure) and `test/integration` (temporary directories, the extension entry end to end).

## Licence

MIT.
