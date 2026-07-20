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

## Player context

- League: {{league}}
- Class: {{characterClass}}
- Ascendancy: {{ascendancy}}
- Main skill: {{mainSkill}}
- Goal: {{goal}}

## What to produce

- `summary`: two or three sentences. What this item is and whether it is worth
  the player's attention. Lead with the verdict.
- `craftRecommendation`: explain the top-ranked recommendation in the player's
  terms — what it does to this specific item and what could go wrong. If the
  recommendation is to stop or sell, say why plainly instead of softening it.
- `possibleUpgrades`: up to four concrete things that would make this item
  better, each one short. Empty array if the item cannot be improved.
- `nextBestAction`: one sentence, imperative. The single thing to do next.

Where player context is `unknown`, ignore it rather than guessing at a build.
