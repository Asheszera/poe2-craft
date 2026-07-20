# ADR-005 — Knowledge base: official API first, poe2db only for what it lacks

**Status:** accepted · **Date:** 2026-07-20

## Context

Tier inference and affix classification (ADR-002) need a modifier database.
The obvious source was poe2db, but two sources were evaluated:

| Source | Format | Provides |
| --- | --- | --- |
| `pathofexile.com/api/trade2/data/stats` | JSON, official | canonical stat ids, `#`-templated text, provenance (explicit/implicit/rune/…) |
| `repoe-fork.github.io/poe2/mods.min.json` | JSON, datamined | generation type, per-tier value ranges, required level, affix names, ladder grouping |
| poe2db.tw | HTML | same as the above, but rendered |

## Decision

Use the two JSON sources. The official API covers *identity* (what modifier is
this?); the RePoE export covers *quality* (which tier, prefix or suffix?).

**poe2db is not scraped.** It was the original plan, but inspection showed its
category pages carry prefix/suffix without tiers, its base-item pages load
modifiers over AJAX, and everything it displays comes from the same datamined
tables the RePoE fork publishes as JSON. Parsing HTML to recover data that is
already available structured would buy nothing and break on any redesign.

Both are **build-time scripts** writing committed JSON under
`packages/data/data/`. The shipped application performs no network I/O for the
knowledge base — a user never sends a request to pathofexile.com or poe2db by
launching the app. Regeneration is manual, per league or major patch.

## Notes from the implementation

- Classification comes from the API's *category* id, not the per-entry `type`
  field: GGG reports rune modifiers there as `augment`.
- Matching required canonicalising both sides — the clipboard prints
  `+38 to maximum Life` while GGG's list is inconsistent about the leading `+`.
  `canonicalTemplate` lives in `@poe2/shared` precisely so the scraper and the
  runtime cannot drift apart.
- The dataset (8194 entries) is asserted, not zod-parsed, at startup;
  validation runs in tests instead. Parsing it on every launch would cost tens
  of milliseconds for a file that cannot change between releases.

## Consequence worth naming

GGG's stat list is exhaustive. A parsed modifier that matches **nothing** in it
is therefore almost certainly not a modifier — it is a property or description
line the block classifier mis-routed. `unmatchedMods()` turns the knowledge base
into a parser self-test that runs against real items in production, which is
strictly better than trusting hand-written fixtures.
