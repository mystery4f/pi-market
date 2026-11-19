# ADR 0003 — Namespacing is unconditional, and it is not configurable

Status: accepted (2026-11-19)

## Context

Imported skills arrive with names the source chose: `retro`, `code-review`, `grill-with-docs`. This machine already holds 94 hand-written skills, and two of those names are already taken (`retro`, `code-review`). pi resolves a skill by name, so two skills sharing one name means one of them is silently unreachable — the user sees a skill listed and the model sees the other one.

Three policies were possible: prefix only on collision, skip on collision, or always prefix.

## Decision

Every converted artifact is named `<plugin>-<skill>`, verbatim from the source plugin name: `pm-execution-retro`, `pm-ai-shipping-code-review`. No flag changes this, no setting disables it.

Within pi-market itself, two packs shipping the same plugin name is refused at install time with both slugs named, rather than letting one win.

## Consequences

- A collision with a hand-written skill is impossible by construction, not by a check that can be skipped.
- Names are stable across updates: the name does not change when the user later installs another source.
- The name is longer than the source's own (`pm-product-discovery-brainstorm-ideas-new` is the longest in the acceptance source), and typing it in a prompt is worse. That is the price of a guarantee.
- Rewrites must follow the rule: a command body saying `Skill(create-prd)` has to name `pm-execution-create-prd`, which is why rewrites are a converter responsibility (ADR 0002) and why they are logged.

## Rejected

- **Prefix only on collision.** Shorter names, but a pack installed later renames nothing while a pack installed earlier may have kept the bare name — so the same skill is `retro` on one machine and `pm-execution-retro` on another, and an update can flip it.
- **Skip on collision with a warning.** Silence is the failure this whole extension exists to remove: the user believes 18 skills installed and 16 did.
- **A user-supplied prefix per source.** Invites `""`, `"a"` and duplicates, and makes pack identity depend on configuration rather than on the source.

## Scope of "taken"

pi keeps skills and prompt templates in two separate namespaces: a skill is resolved by `Skill(name)`, a prompt by `/name`. The acceptance source ships eight plugins that declare both a skill and a command under one name (`pm-product-strategy/business-model`, `pm-execution/pre-mortem`, `pm-toolkit/draft-nda`, …), and both are usable, so a skill name and a prompt name may coincide. Only same-kind names collide: two skills under one name, or two prompts under one name. Refusing the cross-kind pair would have dropped eight of the source's 42 commands for no gain.

The same reasoning fixes what a prompt template may declare: pi takes its command name from the file name, reads only `description` and `argument-hint` from the frontmatter, and ignores anything else, so a converted prompt carries no `name` key.
