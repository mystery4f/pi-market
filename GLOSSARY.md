# GLOSSARY

One term per concept. Use these words in code, docs, tickets and messages. The `_Avoid_` line names the wrong word so it stops reappearing.

## source

A foreign repository or directory that ships skills and slash commands in some layout pi does not read natively — `phuryn/pm-skills` is a source, so is one directory on disk that looks like a Claude plugin.
_Avoid_: marketplace (that is one layout a source can have), pack (that is what a source becomes after install), repo (a source may be a plain directory).

## source slug

The stable directory name a source gets on this machine: `<owner>-<repo>` for git, `<dirname>` for a local path, lowercased. It is the key every command and the panel use to name a source.
_Avoid_: id (reserve `id` for the adapter id), name.

## adapter

The one module type that knows a foreign layout: `detect(root)` decides whether the layout is its own, `read(root, options)` turns it into a `SourceModel`. Adding a format means adding an adapter and nothing else.
_Avoid_: driver, parser, plugin (that word already means a plugin inside a source), 兼容器 (the concept is adapter in code and docs).

## detection

Running the registered adapters in a fixed order over a source root and taking the first `matched`. The result is recorded, so a later update does not re-guess the format.
_Avoid_: sniffing, guessing.

## source model

The neutral, in-memory description an adapter produces: plugins, each with skills and commands, each carrying its origin path. It is the only thing the converter consumes, and it contains no pi-specific naming.
_Avoid_: AST, manifest (the manifest is one input to it).

## plugin

A named group inside a source that bundles skills and commands (`pm-execution`). The plugin name is the namespace every artifact from it carries.
_Avoid_: package, module, group.

## skill

A directory with a `SKILL.md` whose frontmatter gives a name and a description, plus any `scripts/`, `references/` or `assets/` it ships. Copied whole, never partially.
_Avoid_: capability, tool (a tool is what the model calls).

## command

A markdown file under a plugin's `commands/` that becomes a pi prompt template. The converted form is called a prompt template; "command" stays the name of the foreign input.
_Avoid_: slash command (that is the user-facing invocation), prompt (that is the artifact).

## pack

Everything one installed source owns on this machine: its managed directory, its generated artifacts, its recorded state, and its registry entry. A source becomes a pack when installed, and a pack is what update, disable and remove operate on.
_Avoid_: source (a pack is the installed form of a source), bundle, install.

## managed directory

`~/.pi/market/<source slug>/` — the pack's home. It holds `sources/` (the upstream checkout), `generated/` (our output), `bridge/` and `pack.json`. Deleting it plus its registry entry uninstalls the pack.
_Avoid_: cache, workdir, install dir.

## generated artifacts

The output of the converter: `generated/skills/<name>/` and `generated/prompts/<name>.md`. Replaced wholesale on update; never hand-edited, because the next update discards the edit.
_Avoid_: build output, dist, converted files.

## bridge package

A `package.json` this extension generates inside `bridge/` that declares `pi.skills` and `pi.prompts` pointing at the pack's generated artifacts. Its absolute path is the pack's entry in `settings.packages`; that entry is how pi loads a pack.
_Avoid_: shim, link, symlink.

## registry

The `packages` array in `~/.pi/agent/settings.json`, as this extension reads and writes it. The only setting this extension modifies.
_Avoid_: settings (the registry is one key of the settings file), index.

## namespacing

The unconditional rule that a converted artifact is named `<plugin>-<skill>` (`pm-execution-retro`). It exists so an import can never take the name of a hand-written skill.
_Avoid_: prefixing (only when colliding), renaming.

## rewrite

A change the converter makes to a reference inside copied prose: a `/other-command` to the prompt template's actual name, a `Skill(x)` call to the absolute `SKILL.md` path, a relative `references/…` to its absolute path. Every rewrite is recorded in `pack.json`.
_Avoid_: patch, fix-up, sanitising.

## tombstone

A skill whose upstream body is a "this moved to repo X" notice rather than instructions. It is installed like any other and labelled in the listing, so an empty stub is not mistaken for a broken install.
_Avoid_: stub, placeholder, empty skill.

## pin

A source recorded to stay at a specific ref, so an update does not move it until the pin is removed.
_Avoid_: lock (`lock` is the settings file lock and the toolchain lockfile), freeze.

## disable

Dropping a pack's registry entry while keeping every file on disk. The reverse of disable is enable, and nothing is deleted either way.
_Avoid_: uninstall (that removes the directory), mute.

## doctor

The read-only check that answers "why is this pack not visible": adapter resolution, generated `SKILL.md` presence, bridge path in the registry, unsupported layout parts, per-artifact conversion errors.
_Avoid_: validate, verify (`verify` is this repo's own gate script).
