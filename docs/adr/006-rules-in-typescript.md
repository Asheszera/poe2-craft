# ADR-006 — Crafting rules are typed code over a fact layer

**Status:** accepted · **Date:** 2026-07-20

## Context

The brief asks for a rules-based crafting engine, sketched as
`IF physical_damage > 150 AND attack_speed > 10 THEN recommend exalt`, with an
AI layer complementing it later.

The obvious reading is a declarative rule file (JSON/YAML) loaded at runtime.

## Decision

Rules are TypeScript objects — `{ id, priority, when(facts), then(facts) }` —
evaluated against a precomputed `ItemFacts` view of the item.

### Why not a JSON rule DSL

A data-driven rule file looks flexible until the second rule needs a comparison
the schema did not anticipate. Then it grows operators, then conditions, then
arithmetic and null handling — at which point it is a small programming language
with a hand-written interpreter, no type checking, no editor support and no
debugger, wrapping a language that already has all four. The brief also demands
strong typing throughout; a stringly-typed rule file is the opposite of that.

Rules stay isolated where it matters: `when` and `then` receive only
`ItemFacts`, so a rule physically cannot reach around the fact layer into the
raw item. User-editable rules remain possible later by exposing a restricted
builder over the same interface.

### Why a fact layer

Without it, every rule re-derives "how many prefixes are open" in its own
slightly different way, and fixing one leaves the others wrong. `deriveFacts`
computes slots, tier quality, DPS and craftability once; rule bodies become a
single readable condition.

### Why score and explanation share a computation

`deriveSignals` produces named, weighted signals; the score is their weighted
mean and the strengths/weaknesses lists are the same signals filtered by
threshold. Had the number and the prose come from separate code they would
eventually contradict each other on screen, and a user who catches that stops
trusting both.

## Consequences

- Weights live in one visible table in `scoring.ts`. They are a starting
  heuristic to be tuned against real items, not a derivation from first
  principles, and the code says so.
- A rule that throws is caught and skipped rather than taking down the analysis:
  rules are the part most likely to be edited casually.
- `successChance` is stated only where it is actually computable — annulment,
  where the odds are the share of affixes worth losing. Exalted Orb outcomes
  need spawn weights the dataset does not yet carry, so it stays null.
- `estimatedCost` and `estimatedProfit` are null until the price adapters exist.
  A fabricated number the user cannot distinguish from a quote is worse than an
  admitted gap.
