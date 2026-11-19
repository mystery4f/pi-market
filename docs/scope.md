# Scope — pi-market

Status: accepted (2026-11-19). Spec: issue #1. Vocabulary: `GLOSSARY.md`. Decisions: `docs/adr/`.

Every acceptance line is a behaviour plus the proof that shows it. Phase 6 proves exactly these lines.

## In

| Item | Why it is in the first version |
|---|---|
| Adapter interface plus four adapters (claude-marketplace, claude-plugin, bare-skills, local-dir) | The first real source needs two of them (marketplace and single plugin), and the interface is the extension point the user asked for. The other two are what makes "support any repo that ships skills" true rather than aspirational. |
| Skill conversion: whole directory copied, `<plugin>-<skill>` naming, reference rewriting, tombstone tagging | This is the product. A skill whose helpers are left behind is an install that looks successful and does not work. |
| Command conversion: top-level `commands/*.md` to prompt templates with `description` and `argument-hint` preserved | Half of what these sources ship is commands, and pi's prompt templates take them nearly as-is. |
| Managed directory per source, generated bridge package, registry write with backup and lock | ADR 0001. Without this, "installed" is a pile of copied files with no uninstall. |
| `market_install` / `market_update` / `market_list` / `market_remove` / `market_disable` / `market_doctor` | The tool surface, so the agent can do the work in conversation. |
| `/market` command group with the same verbs plus a bare `/market` | Argument-free paths for the user, and the entry to the panel. |
| Update: fetch, reset to ref, re-convert, reconcile removed artifacts, print old→new commit | The user asked for updates explicitly; without reconciliation an update leaves orphans that keep loading. |
| Pin a ref | An update that can silently move a source is worse than no update. |
| TUI panel: source rows, detail page, update / toggle / remove, filter | The user asked for TUI management. |
| Selection of a subset of plugins at install time | A 72-skill source installed whole to try three skills is not a usable first step. |

## Out

| Item | Reason |
|---|---|
| npm publication | The name `pi-market` is taken on npm; the package is loaded as `git:github.com/mystery4f/pi-market`. |
| Claude's non-skill surface — MCP server declarations, subagents, hooks, output styles | Each is a different pi mechanism with its own registration rule; bundling them would make this extension four features. The adapter interface does not promise them. |
| Background/cron update, watch mode | Update is user-invoked; a daemon writing to `settings.json` behind the user's back is the failure mode the lock exists to survive. |
| Translating or summarising skill prose | A converted skill must be the source's text, or its author's intent stops being traceable. |
| Sources from npm or a zip URL | Two transports would double the fetch path for no first-version gain. |
| Editing an installed pack's skill by hand and keeping the edit | Generated artifacts are replaced wholesale; an editor would need a three-way merge to keep them. |
| Concurrent installs of the same source | Refused with the running pid named, not queued: two writers to one `pack.json` is the bug class this design avoids. |

## Deferred

| Item | Unlock condition |
|---|---|
| Cursor-format and other adapters | An adapter is one file plus a registry line (ADR 0002); unlock when a user names a source in a new format. |
| Subagent and hook adapters | Unlock when the tool registration seam for those exists in pi and one source ships them. |
| Per-source prefix override | Unlock only if a real source needs two packs that would otherwise collide on plugin name. |
| Search across installed artifacts from the panel | Unlock when the panel shows more than ~20 rows in practice. |
| Windows service-level file locking on `pack.json` | Unlock if concurrent runs are observed; today the settings lock plus a pid guard covers it. |

## Acceptance lines

Each line is behaviour a person can see, plus its proof. Paths are relative to the repo root.

- Installing a Claude marketplace source produces one managed directory per source with `pack.json`, `sources/`, `generated/skills/`, `generated/prompts/` and `bridge/package.json` — `test/integration/install-marketplace.test.ts`.
- Every converted skill is named `<plugin>-<skill>` and no generated name collides with a user-provided existing-skill list — `test/unit/converter/naming.test.ts`.
- A skill directory's `scripts/`, `references/` and `assets/` are copied and its body's relative references become absolute paths under the managed directory — `test/unit/converter/skill-assets.test.ts`.
- A command becomes a prompt template that keeps `description` and `argument-hint`, and its `$ARGUMENTS` reaches the template unchanged — `test/unit/converter/command-frontmatter.test.ts`.
- A command body's `/other-command` and `Skill(other)` references are rewritten to the names this install uses, and each rewrite appears in `pack.json` — `test/unit/converter/rewrites.test.ts`.
- A tombstone skill is installed and reported as a tombstone by `market_list` — `test/unit/converter/tombstone.test.ts`.
- Detection picks the marketplace adapter for a marketplace root and the bare-skills adapter for a repo with only `skills/`, in that order — `test/unit/adapters/detection.test.ts`.
- The registry write adds exactly one entry, backs up `settings.json`, releases the lock, and replaces (never duplicates) an entry for the same slug — `test/unit/registry/settings.test.ts`.
- A malformed `settings.json` is refused with the file's path in the message and left byte-identical — `test/unit/registry/settings.test.ts`.
- `market update` after an upstream change removes artifacts whose source disappeared and prints the old and new commit — `test/unit/pack/update-reconcile.test.ts`.
- A pinned pack does not move on update, and an unpinned one does — `test/unit/pack/pin.test.ts`.
- A failed fetch leaves the previous artifacts and `pack.json` untouched and says so — `test/unit/pack/failed-fetch.test.ts`.
- A single unconvertible skill is skipped, recorded in `pack.json.errors`, and the rest of the source still installs — `test/unit/converter/partial-failure.test.ts`.
- Disable drops the registry entry and keeps every file; enable restores it — `test/unit/registry/disable.test.ts`.
- `market_doctor` reports a registered-but-empty pack and a pack present on disk but missing from the registry, each with the path it looked at — `test/unit/doctor.test.ts`.
- The panel renders source rows, opens a detail page, and emits update/toggle/remove intents for the selected row — `test/unit/panel/intents.test.ts`.
- End to end through the extension entry: `market_install` on a fixture source, then `market_list` reports that source with its skill and prompt counts — `test/integration/tool-surface.test.ts`.
- Loading the package in a real pi session exposes six `market_*` tools and the `/market` command family — manual, once per release, recorded in `docs/verify.md`.
