# pi-market

Install skill and command marketplaces written for Claude Code into pi — as a **managed pack** under `~/.pi/market/`, never mixed into your own `~/.agents/skills` or `~/.pi/agent/prompts`.

A source can be a Claude marketplace repo, a single plugin inside one, a repo that just has a `skills/` folder, or a directory on disk. The extension fetches it, converts skills and commands into what pi loads, wires the result into pi through a generated bridge package, and keeps the manifest needed to update or remove it later.

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
| `…/generated/skills/`, `…/generated/prompts/` | converted artifacts pi loads; disposable, rebuilt on update |
| `…/bridge/package.json` | the package entry written into `settings.json` |
| `…/pack.json` | manifest: source, adapter, commit, pin, artifact names, rewrites, skipped items |

Skills are renamed `<plugin>-<skill>`; commands keep their name under the plugin's namespace. See `GLOSSARY.md` for the vocabulary and `docs/adr/` for why the directory and bridge exist.

## Commands and tools

| Surface | Does |
|---|---|
| `market_list` | installed sources with counts, adapter, commit, pin |
| `market_install` | add a source, optionally a subset of its plugins |
| `market_update` | fetch again, reconvert, reconcile removed artifacts |
| `market_remove` | uninstall a pack and its bridge entry |
| `market_disable` / enable | drop or restore the bridge entry, keep the files |
| `market_doctor` | find packs that are half-present or out of sync with `settings.json` |
| `/market` | the same verbs, plus a panel to browse and press keys in |

## Development

```
npm install
npm run verify     # check + lint + test
```

Requires Node `>=22.19.0`. Tests are split into `test/unit` (pure) and `test/integration` (temporary directories, the extension entry end to end).

## Licence

MIT.
