Explain the analysis of this item.

## Item

```
{{itemText}}
```

## Structured reading

- Rarity: {{rarity}}
- Item level: {{itemLevel}}
- Affixes used: {{affixSummary}}
- Modifiers with resolved tiers:
{{modifierList}}

## Deterministic analysis

- Score: {{score}}/100
- Strengths:
{{strengths}}
- Weaknesses:
{{weaknesses}}
- Ranked recommendations:
{{recommendations}}

## What the player wants from this item

{{craftIntent}}

Weigh every step against this, and say in the first step if it cannot be met.

**Read the intent against what this item class can actually provide.** A stated
goal is about the character, not about the item in isolation:

- "More DPS" on an item that deals no damage is still a DPS question. Gloves,
  rings, amulets and boots raise damage through attack speed, cast speed,
  critical chance and multiplier, accuracy, added flat damage, penetration,
  attribute requirements they unlock, and by sustaining the resource the skill
  spends. Say which modifier does the work and how.
- If the item genuinely cannot serve the intent — an armour piece asked to add
  spell damage it has no access to — say that plainly rather than stretching to
  fit.
- Say out loud which of the item's properties you are treating as relevant to
  the intent, so the player can tell whether you understood the item.

- When the intent is cost-sensitive, take the cheapest route that reaches it and
  give an explicit stop point. Do not chase perfection the player did not ask for.
- When cost is explicitly no object, ignore currency prices entirely: plan for
  the highest ceiling, and prefer deterministic methods even where they are far
  more expensive than gambling.
- When the intent is to sell, optimise for the modifier combination buyers
  search for, not for the highest raw numbers.
- If the item cannot serve the stated intent — wrong base, wrong modifier pool,
  corrupted — say that plainly first instead of planning around it.

## Crafting methods available in the live game

{{craftingMethods}}

This list comes from the game's own data, not from memory. Plan with it:

- **Only name methods that appear above.** If you cannot recall a specific
  essence or omen by name, describe what you need it to do
  ("an essence that guarantees added cold damage") rather than inventing one.
- **Consider the whole toolset, not just the basic orbs.** A plan that only ever
  reaches for Transmutation, Regal, Exalted and Divine is ignoring most of the
  game. Essences make an outcome deterministic; omens change how another
  currency behaves; runes add a fixed modifier through a socket; the
  Greater and Perfect variants of an orb bias it towards higher tiers.
- **Where two routes reach the same result, give the cheap one and name the
  expensive deterministic one as the alternative**, so the player can choose by
  budget rather than by guesswork.
- If a method's exact behaviour in the current league is something you are not
  sure of, say so in that step instead of asserting it.

## Player context

- League: {{league}}
- Class: {{characterClass}}
- Ascendancy: {{ascendancy}}
- Main skill: {{mainSkill}}
- Build goal: {{goal}}

## What to produce

- `summary`: two or three sentences. What this item is and whether it is worth
  the player's attention. Lead with the verdict.
- `craftRecommendation`: explain the top-ranked recommendation in the player's
  terms — what it does to this specific item and what could go wrong. If the
  recommendation is to stop or sell, say why plainly instead of softening it.
- `steps`: an ordered plan, one action per entry, starting from the item's
  current state. Empty array when there is nothing to do — corrupted, finished,
  or not worth continuing. Never describe steps that have already happened.
- `possibleUpgrades`: up to four concrete things that would make this item
  better, each one short. Empty array if the item cannot be improved.
- `nextBestAction`: one sentence, imperative. The single thing to do next.

Where player context is `unknown`, ignore it rather than guessing at a build.
