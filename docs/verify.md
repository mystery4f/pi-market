# Acceptance run

What one real source proves, and how to repeat it. The source is
[phuryn/pm-skills](https://github.com/phuryn/pm-skills) (`marketplace.json`, version 2.3.0), nine
plugins, the largest Claude-format marketplace we know of that ships both skills and commands.

## What the run showed (2026-11-20)

| Step | Result |
| --- | --- |
| `installSource` on a local clone of pm-skills | adapter `claude-marketplace`, 9 plugins, commit `local-…` |
| skills converted | 72 directories under `generated/skills/` |
| commands converted | 42 prompt templates under `generated/prompts/` |
| errors | none |
| rewrite records | 44 distinct changes, 0 unresolved |
| tombstones | 3: `pm-ai-shipping-code-review`, `-intended-vs-implemented`, `-shipping-artifacts`, all installed and flagged |
| `pack.json` | 9 plugins, artifacts and rewrites listed, `where` is a pack-relative path |
| `package.json` bridge | `pi-market-bridge-<slug>` declaring `./generated/skills` and `./generated/prompts` |
| `settings.json` | one entry appended, the pre-existing `model` key byte-identical |

Skills and commands that share a name inside one plugin (`pm-product-strategy/business-model`,
`pm-execution/pre-mortem`, `pm-toolkit/draft-nda`) both install: pi resolves them in separate
namespaces (skills by `Skill(name)`, prompts by `/name`).

## Repeat it

```sh
git clone --depth 1 https://github.com/phuryn/pm-skills .tmp/pm-skills
npm run acceptance -- .tmp/pm-skills
```

The script installs into `.tmp/acceptance/run/`, never into the real market, and prints the counts
above. It exits non-zero on a bad source argument; a rewrite that failed to land is reported on the
last line as `rewrites broken: …`, so a silent converter regression shows up here first.

## Interactive check

The panel needs the terminal UI, so it cannot run headless:

```sh
pi install /absolute/path/to/pi-market
# in pi: /reload
# in pi: /market panel
```

Then walk the list with the arrow keys, `/` to filter, `enter` for the details page (skills,
prompts, skipped entries), `u` to update the selected pack, `t` to disable or enable it, `x` twice
to remove it, `alt+q` to close. `pi-market` in the widget line reflects the pack count on the next
refresh.
