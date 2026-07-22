# ADR-010 — Crafting is simulated as a state machine, from first-party data

**Status:** accepted · **Date:** 2026-07-21

## Context

The advisor could describe what a base can roll and how likely each modifier is,
but it could not answer the questions a crafter actually asks: *what sequence of
currencies gets me there, and how likely is the whole sequence?* Those are not
per-currency facts. A currency changes the item, the next currency sees the
changed item, and the probability of the second step depends on the outcome of
the first — hitting a modifier closes its exclusion group and shrinks the pool
for everything after it.

Treating each currency as an isolated action, or multiplying independent
per-step chances, gets this wrong. The correct model is a state machine over a
mutable item with the pool recomputed after every step, and conditional rather
than independent probabilities.

Two things were needed that the knowledge base did not yet have:

1. **What each currency does.** `currencies.json` (the trade API) has names and
   categories, no effects. So the app knew 780 currency names and could not say
   what a single one of them did.
2. **A source that is right about PoE2, not PoE1.** The community model of
   crafting is frequently PoE1's, and the two games differ on the most-used
   currency in the game: a PoE1 Chaos Orb rerolls every modifier; a PoE2 Chaos
   Orb removes one and adds one.

## Decision

**Currency effects come from the game's own item descriptions**
(`base_items.min.json`, the `properties.description` field), scraped into
`data/currency-effects.json` — 817 described items. This is first-party text:
the Chaos Orb entry reads "Removes a random modifier and augments a Rare item
with a new random modifier", settling the PoE1/PoE2 question from the game
itself rather than from anyone's memory.

**`@poe2/craft` models crafting as a state machine.**

- `CraftState` is an immutable item: base, item level, rarity, prefixes and
  suffixes as `StateMod`s keyed by exclusion group, and a corruption flag.
- `candidates()` recomputes the rollable pool from a state — open slots, item
  level, occupied groups, and an optional side/tag filter — so every step plans
  against the pool the previous step left.
- Currencies are defined as short sequences of primitive operations (`add`,
  `remove`, `clear`, `setRarity`, `reroll`). A Chaos Orb is `remove` then `add`,
  and the `add` sees what the `remove` left — composite effects and ordering
  fall out of the sequence rather than being special-cased.
- `simulate()` runs a sequence against the distribution of states each step
  produces, banking probability mass onto branches that satisfy the goal and
  advancing the rest. The reported chance is conditional across the whole
  sequence, and merging branches by "goal + occupied groups" keeps it exact for
  the goal without the tree exploding.

**Each currency definition is pinned to the game's text.** `CURRENCIES[n].
description` must equal the scraped description exactly, checked by a test, so a
patch that changes an effect breaks the build instead of leaving the simulator
modelling last league's behaviour.

**What the game does not determine is not modelled.** Vaal Orb ("modifies an
item unpredictably"), omens and essences are absent from the operation table
rather than approximated. `simulate()` returns `currency not modelled` for them,
which is a truthful answer, unlike an invented probability.

## Consequences

- The advisor can answer "which sequence reaches +Life T1 and chaos resistance",
  "is a Chaos better than annul-then-exalt here", and "does this ordering make
  the goal impossible" — each by simulating, not by a hardcoded rule.
- The probabilities are the game's own where spawn weights are published
  (ADR-005) and flagged as estimates where they are not; `remove` is uniform
  over present modifiers, because spawn weight governs what appears, never what
  is removed.
- The craft prompt now carries the core orbs' real effects, so the model plans
  with the PoE2 Chaos Orb rather than the PoE1 one.
- The Craft Advisor screen has a sequence builder: pick target modifiers from
  the base's own pool, stack currencies, and see the conditional chance after
  every step. Goals cross IPC as data (`GoalSpec`), never as a predicate — the
  main process rebuilds the function, so the renderer ships no code. The
  `craft:currencies` channel offers only the modelled currencies, so an
  unmodelled one never reaches the builder.

## Boundary

Everything the simulator asserts traces to first-party data: the pool to the
game's mod tables, the weights to its published spawn weights, the currency
behaviour to its own item descriptions. Where a currency's effect is not stated
plainly enough to model, the app says it is not modelled. Nothing here invents a
mechanic or a number.
