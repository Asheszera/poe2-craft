Judge whether this item serves the player's build.

## Item

```
{{itemText}}
```

## Structured reading

- Rarity: {{rarity}}
- Item level: {{itemLevel}}
- Affixes used: {{affixSummary}}
- Modifiers:
{{modifierList}}

## The build

- League: {{league}}
- Class: {{characterClass}}
- Ascendancy: {{ascendancy}}
- Main skill: {{mainSkill}}
- Goal: {{goal}}

## What to produce

- `score`: 0 to 100, **for this build specifically**. An item can be objectively
  excellent and useless here; say 20 when that is the truth. This is not the
  item's quality score — it is its fit.
- `verdict`: one of `equip`, `craft`, `sell`, `vendor`, `unclear`.
- `reasoning`: two or three sentences. Lead with the verdict, then the single
  reason that decided it.
- `whatWorks`: the modifiers that actually help this build, each with *how* —
  name the mechanism, not just the modifier. "Attack speed raises Explosive
  Shot's throughput directly" is useful; "attack speed is good" is not.
- `whatIsMissing`: what this item lacks for this build, most important first.
- `assumptions`: anything you had to assume. Be strict about this.

## How to judge

- **Judge against the stated build, not against the game in general.** A
  resistance is not automatically good; it is good if this character needs it.
- **Say when a field was not given.** If the main skill is unknown you cannot
  judge damage scaling — put that in `assumptions` and lower your confidence
  rather than inventing a build. If class, ascendancy and skill are all unknown,
  `verdict` is `unclear` and the score reflects that you are guessing.
- **Do not invent modifiers or numbers.** Only what the item shows.
- If you are not certain how a skill or ascendancy behaves in the current
  version of the game, say so in `assumptions` instead of asserting. Your
  training has a cutoff; the game does not.
