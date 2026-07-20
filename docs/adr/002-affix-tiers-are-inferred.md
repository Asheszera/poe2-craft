# ADR-002 — Affix tiers are inferred, and the model says so

**Status:** accepted · **Date:** 2026-07-20

## Context

The brief models a modifier as `{ type, stat, value, tier }`. The PoE2 clipboard
export does not contain affix tiers, nor whether a modifier is a prefix or a
suffix. Both must be derived by matching the modifier against a mod database
using `(template, value, itemLevel, base)`.

That derivation is frequently **ambiguous**: adjacent tiers have overlapping
value ranges, so a roll in the overlap cannot be attributed to a single tier.

## Decision

1. `@poe2/parser` stays pure and never touches the database. It emits
   `affixType: 'unknown'`, `tier: null`, `matched: false`.
2. Enrichment is a separate pass owned by `@poe2/data`.
3. `tier` is `{ value, total, name, confidence } | null`, where `confidence` is
   `exact` (client stated it), `inferred` (uniquely resolved) or `ambiguous`.

## Addendum — not every modifier is an affix

Tier inference only applies to modifiers that occupy a prefix/suffix slot.
`AFFIX_CATEGORIES` (`explicit`, `crafted`, `fractured`, `desecrated`) defines
that set; implicits, runes and enchantments are *intrinsic* — they exist on the
item without consuming a slot and have no affix tier to resolve.

Conflating the two makes `mods.length` meaningless: a rare with two runes and an
implicit looks far fuller than it is. Since "how full is this item" is the input
to every crafting decision, the distinction lives in the model
(`affixMods` / `intrinsicMods` / `affixBudget`) rather than in the UI.

`exceedsAffixBudget` falls out of the same model: a rare cannot hold more than
six affixes, so exceeding that is proof of a parsing fault, and it is surfaced
in the item card instead of being silently wrong.

## Consequences

- The UI is structurally unable to print a guessed tier as a fact; ambiguity has
  to be rendered (e.g. "T2–T3").
- The parser can be tested exhaustively without any data fixtures, and stays far
  inside its 20 ms budget.
- Localisation later means swapping the template table in `@poe2/data`; the
  parser code does not change.
- A missing mod entry degrades gracefully: `statId` falls back to a slug of the
  template, so unknown mods remain groupable and queryable.
