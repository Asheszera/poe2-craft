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

## Addendum (2026-07-21) — exclusion groups in, spawn weights out

Re-reading the datamined export turned up two fields the first pass discarded,
and one absence worth writing down so nobody goes looking twice.

**Kept: `groups`.** An item carries at most one modifier per exclusion group,
and the group is *not* the ladder `type` — 1567 of 2586 item affixes disagree,
and 70 groups span more than one ladder. On a Rawhide Belt, increased flask
*life* recovery and increased flask *mana* recovery share the group
`BeltFlaskRecoveryRate`: different text, different ladder, mutually exclusive.
Matching on the modifier's text alone offered the second one on an item that
could never roll it — 2 of 7 prefixes wrongly listed on that base. `ModPoolIndex`
now marks those `blockedBy`, and the prompt drops them entirely.

**Kept: `implicit_tags` + `adds_tags`.** 64 tags — `life`, `attack`, `caster`,
`elemental`, `defences` — merged into `ModEntry.tags`. This is how a stated
intent reaches the pool at all: "more DPS" is not the name of any modifier, and
without tags the model has to guess which lines serve the goal.

**Dropped, and this was a mistake — see the correction below.** `spawn_weights`
in the RePoE export is 0 or 1 on every row, which was read as "PoE2 has no
modifier weights". The real weights exist; that export is simply wrong about
them.

## Addendum (2026-07-21) — modifier weights: wrong once, then found

PoE2 **does** have graded modifier spawn weights, they **are** public, and the
first pass through this concluded the opposite. Recording how, because the way
the error survived scrutiny matters more than the error.

### The claim that was wrong

"Every spawn weight in the data is 0 or 1, so PoE2 weights modifiers by
eligibility only, and no probability model is possible." Four sources appeared
to agree, and the RePoE exporter's source seemed to close the case: it passes
`SpawnWeight_Values` through untouched, so the 0s and 1s looked like the game's
own. That reasoning was sound about the code and wrong about the data.

### What the data actually says

poe2db embeds the dataset behind its crafting calculator directly in the page,
one object per modifier: `{"DropChance":"1000","Level":"1","Name":"of the
Brute","spawn_no":["ring","amulet","belt","str_armour",…]}`. Weights are graded —
1000, 800, 500, 400, 300, 250, 125, 100 — exactly as in PoE1.

The same modifier, in both sources:

| Source | `of the Brute` (`Strength1`, +5–8 Strength) |
| --- | --- |
| poe2db | `DropChance` **1000**, tags `ring, amulet, belt, str_armour, …` |
| RePoE fork | `spawn_weights` **1**, tags `ring, amulet, belt, str_armour, …` |

Identical tag list in identical order — the same row of `Mods.dat` — and a
different number. **The RePoE fork's PoE2 export is lossy for spawn weights.**
Its parser code is faithful; whatever it reads those integers from is not.

### How the error survived

Two failures compounded, and only the second was bad luck:

1. **A regex that quietly excluded the answer.** The extraction used
   `"DropChance":\s*([0-9.]+)` — unquoted numbers only. poe2db writes graded
   weights as strings (`"DropChance":"1000"`) and the binary ones as bare
   numbers. The pattern matched every 0 and 1 and *nothing else*, then reported
   "distinct values: 0, 1" with total confidence. A filter that removes exactly
   the evidence that would refute the hypothesis is the worst kind of bug,
   because its output looks like a finding.
2. **A first sample that agreed with it.** `Claws` was checked first and its page
   really does carry only a misc subset with 0/1 weights. Corroboration arrived
   before contradiction had a chance.

The lesson is not "write better regexes". It is that **a negative result about a
data source deserves the same scrutiny as a positive one.** "This does not
exist" was accepted on weaker evidence than "this exists" would have needed, and
it was published in an ADR, where it would have been believed later.

### Where the weights live

| Item class | URL pattern | Example |
| --- | --- | --- |
| Jewellery, weapons, quivers | `/us/{Class}` | `/us/Amulets` — 315 records, 203 weighted, max 1000 |
| Armour | `/us/{Class}_{attributes}` | `/us/Body_Armours_str` — 469 records, 144 weighted |

`/us/Gloves`, `/us/Body_Armours` and the other bare armour URLs carry no calc
data at all, which is why armour first looked unweighted. Each record has the
modifier text, its required level, its weight, and `spawn_no` — the tag list the
weight applies to, so a weight can be resolved against a specific base's tags.

### Decision

`scrape-weights.ts` fetches one page per item class — and per attribute variant
for armour — and writes `data/mod-weights.json`: `contexts[page][key] = weight`,
plus `bases[name] = page`. The join key is
`template|level|prefix\|suffix|group`, which identifies one tier of one ladder in
both datasets. **87%** of scraped weights join to `mods.json`; the remainder are
the desecrated pool, which sits at a fixed level 65 and does not correspond to
ordinary affix tiers. Joining those by force would be worse than leaving them out.

`PoolOption` now carries `weight` (published, summed over the tiers the item
level allows) and `chance` (that over the affix side's total). Both are nullable
and `PoolOptions.chanceBasis` is `weights` or `tiers`, because three states have
to stay distinguishable:

- weights published, modifier covered → the game's real odds;
- weights published, this modifier absent → `chance: null`, shown as unknown.
  Inventing one share silently shrinks every other;
- no weights for this base at all → `tiers` basis, the old approximation, and
  every renderer says so.

The numbers this produces are recognisably the game's. On Pauascale Gloves at
item level 80, each elemental resistance carries 1000 per tier and chaos
resistance 250 — a fourfold gap that counting tiers had flattened to nothing.

### What is still missing

Weapons other than maces, sceptres, spears, staves, wands, bows and crossbows —
swords, axes, daggers, claws, flails, warstaves — have pages with no graded
weights, as do the `str_dex_int` armour variants. Those bases fall back to the
tier approximation and say so. The scraper prints the list on every run rather
than filling the gap with something invented.
