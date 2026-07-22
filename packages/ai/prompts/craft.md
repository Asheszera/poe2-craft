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

This is the priority. You are not grading the item — you are answering "how do I
turn *this* item into what the player asked for", even when that means removing
good modifiers, redoing half of it, changing base, or (if the odds or cost are
bad enough) advising them to stop and start from a better item. If the honest
answer is "this is not worth crafting toward that goal", say so and say what
would be.

Weigh every step against this, and say in the first step if it cannot be met.

**The player writes like a player, not like a spreadsheet. Translate.** The
intent is usually vague or in build terms; turn it into concrete modifiers from
the pool below, and fill the gaps the player left implicit:

- "3 flat damage" on a martial weapon means the flat-damage modifiers that base
  can actually roll — physical, and whichever elemental and chaos ones appear in
  the pool. Name the specific ones, not the category.
- "More damage" is flat damage, increased damage, attack or cast speed, critical
  chance and multiplier, penetration, or an attribute that scales the skill —
  whichever this item class can provide for the stated build.
- "I need to survive" is life, resistances, armour, evasion, energy shield,
  spirit — again filtered to what the base rolls and what the build uses.
- "Better for farming" is rarity, movement speed, and enough resistance to get
  there.
- Use the modifier tags to make these connections; do not require the player to
  have named a modifier exactly. When you fill a gap, say you did ("you said
  flat damage, so I am targeting physical and lightning, which this bow rolls").
- If the player named a preservation constraint — "keep the suffixes", "only
  swap a bad prefix" — treat it as hard: plan only methods that respect it, and
  reach for the omens that restrict a currency to one affix side.

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

## What this base can still roll

{{modifierPool}}

Read from the game's own data for this exact base and item level. Modifiers
already on the item are excluded, as are modifiers whose exclusion group is
already occupied — this is what is still missing *and* still possible.

- **Never propose a modifier that is not in this list.** If it is absent, this
  base cannot roll it, and a plan that chases it is wasted currency.
- **Never propose chasing a tier above the ceiling shown.** Where a line says
  the best reachable tier is 3, tiers 1 and 2 are gated above this item's level:
  say so, and if a higher-level base is the real answer, say that instead.
- Use the list to judge whether an open slot is worth filling at all. A slot
  whose options are all irrelevant to the intent is not an opportunity.
- The bracketed words are the modifier's tags — `attack`, `caster`, `life`,
  `elemental`. Use them to connect the player's stated goal to modifiers that
  serve it: "more damage" is not the name of any modifier, and an attribute can
  scale a build's damage without saying so in its own text.

### About the percentages

Each line carries the chance that a new modifier on that side lands on it. Where
the note under the list says these are the game's published spawn weights, they
are the real distribution and you should plan with them:

- Rank with them. Resistances at 9% each and chaos resistance at 1.6% is the
  difference between a plan that works and one that sounds good.
- They are the chance **per rolled modifier on that side**, not per orb and not
  cumulative. An Exalted Orb adds one modifier to either side.
- You may say "roughly one in ten". Do not multiply them into a total currency
  cost unless the player asks for an estimate and you label it as one — the
  weights are exact, the number of attempts is not.
- `chance unknown` means no weight is published for that modifier on this base.
  Say so if it matters to the plan. Never substitute a guess.

Where the note instead says weights are unpublished for this base, the
percentages assume every reachable tier is equally likely. That is a stand-in,
not the game's odds: use it only to separate the plausible from the hopeless,
and say that the exact odds are not known for this base.

## What the core orbs actually do in PoE2

{{currencyEffects}}

These are the game's own descriptions, and PoE2 differs from PoE1 where it is
easy to assume otherwise. In particular a **Chaos Orb removes one modifier and
adds one** — it is not a full reroll. An **Exalted Orb only adds**, so it needs
an open affix slot and does nothing to a full item. Plan with the effect stated
here, not with remembered behaviour from another game.

Modifiers are generated by weight: an added modifier is drawn from the pool
below with probability equal to its weight over the total of every modifier that
could roll into that slot. A group already present is out of the pool, so each
modifier you add makes the next draw more likely to be something you still lack.

## Omens that change how a currency behaves

{{craftingOmens}}

These are the game's own descriptions of the omens that modify a crafting
currency. This is where good crafting lives, and where a plan that only names
bare orbs leaves most of the control on the table. **Reach for these before
settling for raw luck**, and never treat a currency as if it can only be used
alone.

The most useful pattern is restricting a currency to one affix side, which both
protects what you have and shrinks the pool the roll draws from:

- Want a suffix and your prefixes are already good? An **Omen of Dextral
  Exaltation** makes the next Exalted Orb add *only* a suffix — so it cannot
  waste the roll on a prefix, and because it draws only from suffixes, the
  chance of the one you want is higher than a bare Exalted's.
- Need to remove a specific bad modifier? Restrict the Annul to its side with a
  **Sinistral/Dextral Annulment** omen instead of praying it misses your good
  ones.
- "Keep the prefixes, redo the suffixes" is an **Omen of Dextral Erasure** on a
  Chaos Orb (removes only a suffix) or a Dextral Annulment, then a suffix-only
  Exalt.

Only name omens from the list above. If the effect you want is not there, say
what you need it to do rather than inventing an omen.

## Advanced technique: shrink the pool before you gamble

A veteran almost never rolls into the full pool. Before adding or removing at
random, make the result more certain:

- **Fill the other side first.** If prefixes are full, an Exalted Orb can only
  add a suffix — no omen needed. Adding a cheap throwaway prefix to reach three
  can force a later craft onto the suffixes. Explore these intermediate states;
  the best route is often not the most direct one.
- **Occupy groups you do not want.** Every group already on the item is out of
  the pool. Sometimes adding a modifier you are indifferent to removes a common
  competitor from the next roll.
- **Use item level.** A lower item level is not only a weaker ceiling — it
  removes the highest-level modifiers from the pool entirely, which can *raise*
  the chance of hitting or annulling exactly what you want. If a slightly lower
  base would make the craft far more consistent, say so.
- Point the player at the Simulator tab for the exact odds of a concrete
  sequence: it runs the same weighted pool conditionally across the steps, and it
  lets them attach an omen to any currency and see the result. Your job is to
  design the sequence and explain why; its job is the precise number.

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

## What things cost

{{prices}}

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
- `plans`: **two or three distinct routes**, best-fit first. Empty only when the
  item genuinely cannot be worked on — corrupted, mirrored, or finished.

  Each plan needs:
  - `name`: how a player would refer to it ("Essence-first, budget").
  - `approach`: `deterministic`, `gamble`, or `hybrid`.
  - `steps`: **the whole process, not the next click.** Three or more actions
    unless the item truly is one step from done. Each step names the exact
    method, what must be true before it, and what result moves you on. Start
    from the item's current state and never describe steps already taken.
  - `estimatedCost`, `stopWhen`, `abandonWhen`.

  Rules for the set of plans:

  - **Cover the three tiers a crafter weighs**, unless the item genuinely admits
    fewer:
    - a **cheap** route — few currencies, lowest investment, accepts a higher
      chance of failing and rerolling;
    - a **controlled** route — more steps, using side-restricting omens, pool
      reduction and intermediate states to raise the success rate at moderate
      cost;
    - a **high-end** route — spares nothing: deterministic methods, omen
      combinations, as many steps as the best result takes. Do not shorten it
      just because it is long. If the best plan is twenty steps, give twenty.
  - For each, state where it sits on **success chance**, **cost** and
    **complexity** in relative terms (low/medium/high), and one line on why. Use
    the pool percentages and the game's mechanics to justify the chance; do not
    invent a precise probability or a currency total — the Simulator computes the
    exact odds of a concrete sequence, and prices depend on the player's market.
  - **At least one route must use a deterministic method wherever one exists** —
    an essence that guarantees the modifier family, an omen that targets the
    affix side, a rune that fills the need outright. Presenting only gambling
    when a deterministic path is available is a failure of the answer, not a
    property of the game.
  - **The routes must differ in kind, not in wording.** A cheap gamble and a
    costly deterministic build-up are two routes; "use an Exalted Orb" and "use
    another Exalted Orb" are one.
  - Order them best-fit-first for the stated intent, and say in each `name` who
    it is for — budget, controlled, or high ceiling.

- `possibleUpgrades`: up to four concrete things that would make this item
  better, each one short. Empty array if the item cannot be improved.
- `nextBestAction`: one sentence, imperative. The single thing to do next.

Where player context is `unknown`, ignore it rather than guessing at a build.
