# ADR 0006 — This extension's own manifest globs the market

Status: accepted (2026-11-20)

## Context

ADR 0005 moved the per-pack entries out of `settings.json` and left exactly one for the whole
market, `../market`. The user asked for that one to go too ("这个 ../market 也能不写吗"), so
`settings.json` should name nothing but the extension itself.

pi resolves a package's manifest paths relative to the package root and expands globs through
`expandPackageGlob`, whose filter keeps a match when every path segment is either `..` or does not
start with a dot (`dist/core/package-manager.js:143-149`). A `..` segment is therefore legal: a
manifest may point outside its own directory, and pi will load what it finds there.

A git install of this extension is checked out at
`~/.pi/agent/git/github.com/<owner>/pi-market`, which is five levels below `~/.pi`. From that root,
`../../../../../market` is `~/.pi/market`.

## Decision

`pi-market`'s own `package.json` declares the market trees:

```json
"pi": {
  "extensions": ["./src/index.ts"],
  "skills": ["../../../../../market/*/generated/skills"],
  "prompts": ["../../../../../market/*/generated/prompts"]
}
```

`settings.json` needs one entry and nothing else: `git:github.com/mystery4f/pi-market`. No market
package, no per-pack bridge, no settings write on install, update, disable or remove. The constants
live in `src/market/registry/bridge.ts` (`MARKET_SKILLS_GLOB`, `MARKET_PROMPTS_GLOB`), a test keeps
`package.json` in step with them, and `market_doctor` reports when the extension entry is missing or
a per-pack entry is left over.

## Alternatives rejected

- **Keep `../market` in settings.** One hand-written path the user did not want; every machine's
  file must agree with the layout.
- **Write the two globs into settings as `skills`.** Uses a different pi subsystem, duplicates the
  same knowledge, and still edits the user's file.

## Consequences

- The globs are tied to the checkout depth. An npm install, a project-scope install or a checkout in
  another directory breaks them; `docs/verify.md` records the one layout that is supported, and
  `market_doctor` is where a broken layout has to show up.
- pi must keep allowing `..` in manifest globs. If that changes, every installed skill disappears at
  the next start, so the alternative in ADR 0005 (`settings` entry `../market`) stays documented as
  the fallback.
- Disabling a pack still works by renaming `generated` to `generated.disabled`, since the glob matches
  the directory name.
