# ADR-007 — The AI narrates the analysis; it never produces it

**Status:** accepted · **Date:** 2026-07-20

## Context

The brief asks for an AI layer that returns a summary, strengths, weaknesses,
market value, craft recommendation, upgrade paths, risk, next action, cost and
profit. Read literally, that makes the model the analysis engine.

By this stage the deterministic engine already computes score, strengths,
weaknesses and ranked recommendations from real data — datamined affix tiers and
the item's own affix budget.

## Decision

The model receives the **deterministic analysis alongside the item**, and its
job is to explain that analysis in the player's language. It does not compute a
score, a tier, a probability or a price.

`prompts/system.md` states this as hard rules: never contradict the analysis,
never invent numbers, never invent modifiers, and treat anything marked
`tier unresolved` as uncertain out loud.

## Why

An LLM asked to rate an item will produce a confident number with nothing behind
it. The rules engine's 73/100 is reproducible and traceable to affix tiers; a
model's "8/10" is a guess in the shape of a fact. Handing the model the
computed analysis costs a few hundred tokens and removes the entire class of
hallucinated tiers, prices and odds.

It also keeps the product working without the model. Layers 0 and 1 are offline
and deterministic; if the key is missing, the rate limit hits, or the network is
down, the user still gets the score and the advice — only the prose is missing.

## Implementation notes

- **Structured outputs, not streaming.** The narrative is short and shaped
  (`summary`, `craftRecommendation`, `possibleUpgrades`, `nextBestAction`), so
  it is requested with `output_config.format` and a JSON schema, then validated
  against the zod model. This reverses an earlier intention to stream: streaming
  prose would have meant parsing free text, trading a guarantee for an animation.
  Streaming becomes worthwhile when the Build Advisor generates long-form text.
- **Interface segregation over the brief's shape.** The brief put
  `generate/chat/embeddings` on one interface. Embeddings only matter once a
  vector store exists (stage 4), and a shared interface would force every
  provider to throw from a third of its surface. `AIProvider` carries `narrate`;
  `EmbeddingProvider` is separate and currently unimplemented.
- **Prompts are `.md` files** imported with Vite's `?raw`, not read with `fs` —
  runtime reads inside an asar archive need explicit packaging rules, while
  `?raw` inlines at build time and behaves identically in main, tests and
  renderer.
- **Custom user instructions are appended below the hard rules**, never
  prepended, so a custom prompt cannot quietly replace the safety rules.
- **No prompt caching.** The cacheable prefix minimum for this model is 4096
  tokens and the system prompt is far below it; a `cache_control` marker would
  be an inert decoration that looks like an optimisation.

## Model-version notes

Written against Claude Opus 4.8, whose request surface differs from older
models in ways that fail loudly:

- `thinking: {type: 'adaptive'}` is the only on-mode; the older
  `{type: 'enabled', budget_tokens: N}` form returns a 400.
- `temperature`, `top_p` and `top_k` are rejected outright — tone is steered
  through the system prompt instead.
- Safety classifiers can decline with **HTTP 200** and an empty body, so
  `stop_reason` is checked before `content` is read.

This is also why the SDK is pinned to a recent version: 0.71 did not yet type
`adaptive` thinking, and the compiler caught it.
