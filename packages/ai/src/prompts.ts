import {
  craftingToolsetPrompt,
  currenciesDataset,
  defaultModPool,
  type PoolOption,
} from '@poe2/data';
import { affixBudget, affixMods, type ItemMod, type ParsedItem } from '@poe2/models';
import { canonicalTemplate } from '@poe2/shared';
import craftTemplate from '../prompts/craft.md?raw';
import jsonOutputTemplate from '../prompts/json-output.md?raw';
import systemTemplate from '../prompts/system.md?raw';
import type { NarrativeRequest } from './types.js';

/**
 * Prompt templates live in `prompts/*.md`, never inline in code.
 *
 * They are imported with Vite's `?raw` rather than read with `fs`: the app ships
 * inside an asar archive where runtime file reads need explicit packaging rules,
 * whereas `?raw` inlines the text at build time and works identically in the
 * main process, in tests and in any future renderer usage. The cost is that this
 * package assumes a Vite-family bundler — which the whole workspace already does.
 */

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/**
 * Substitutes `{{name}}` placeholders.
 *
 * A missing key is a template bug, not a runtime condition, so it throws rather
 * than silently rendering `{{itemText}}` into a prompt sent to a paid API.
 */
export function render(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(PLACEHOLDER, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) {
      throw new Error(`[prompts] no value supplied for placeholder "${key}"`);
    }
    return value;
  });
}

const bullets = (lines: readonly string[], empty = 'none'): string =>
  lines.length === 0 ? `  - ${empty}` : lines.map((line) => `  - ${line}`).join('\n');

/**
 * Renders a modifier the way the prompt should see it — uncertainty included.
 *
 * Where the client stated a roll's window (Advanced Item Description) it goes
 * in verbatim: "rolled 80 of 80-89" tells the model the roll sits at the top of
 * its tier without the model needing to know that tier's numbers, and it is the
 * difference between "upgrade this" and "this one is already maxed".
 */
function describeMod(mod: ItemMod): string {
  const parts: string[] = [
    mod.affixType === 'unknown' ? mod.category : `${mod.category}/${mod.affixType}`,
  ];

  if (mod.tier) {
    const total = mod.tier.total === null ? '' : `/${mod.tier.total}`;
    const hedge = mod.tier.confidence === 'ambiguous' ? ' (uncertain)' : '';
    parts.push(`T${mod.tier.value}${total}${hedge}`);
  } else {
    parts.push(mod.matched ? 'tier unresolved' : 'tier unresolved, unknown modifier');
  }

  if (mod.affixName) parts.push(`"${mod.affixName}"`);
  if (mod.tags.length > 0) parts.push(`tags: ${mod.tags.join('/')}`);
  for (const range of mod.valueRanges) {
    parts.push(`rolled ${range.value} of ${range.min}-${range.max}`);
  }

  return `${mod.text.replace(/\n/g, ' / ')} [${parts.join(', ')}]`;
}

const orUnknown = (value: string | null): string => value ?? 'unknown';

/**
 * How many options to show per affix side.
 *
 * A base commonly accepts fifty-odd ladders. Listing all of them would bury the
 * item under its own possibility space; the best-tier-first ordering means the
 * cut falls on the options least worth chasing.
 */
const MAX_POOL_OPTIONS = 24;

/**
 * The modifiers this item could still gain, and how good they can get.
 *
 * Modifiers already on the item are removed: a plan is about what is missing.
 * Every line carries the ceiling this item level allows, so the model cannot
 * propose chasing a tier the item can never reach.
 */
function describePool(item: ParsedItem): string {
  const pool = defaultModPool();
  if (!pool.knows(item.baseType)) {
    return `  - unknown base ("${item.baseType}"), so the modifier pool could not be looked up`;
  }

  const present = new Set(item.mods.map((mod) => canonicalTemplate(mod.template)));
  const options = pool.options(item.baseType, item.itemLevel);

  const side = (label: string, list: PoolOption[]): string => {
    const available = list.filter((option) => !present.has(option.key));
    if (available.length === 0) return `  - ${label}: nothing further available`;

    const shown = available.slice(0, MAX_POOL_OPTIONS).map((option) => {
      const ceiling =
        option.bestTier === 1
          ? 'tier 1 reachable'
          : `best here is T${option.bestTier}/${option.tierTotal}` +
            (option.topTierLevel === null ? '' : `, T1 needs ilvl ${option.topTierLevel}`);
      return `    - ${option.text} — ${ceiling}`;
    });

    const more =
      available.length > shown.length ? `\n    - (${available.length - shown.length} more)` : '';
    return `  - ${label} (${available.length} available):\n${shown.join('\n')}${more}`;
  };

  return `${side('prefixes', options.prefix)}\n${side('suffixes', options.suffix)}`;
}

/**
 * Built once: the toolset is the same for every item, and rebuilding it per
 * request would walk 780 entries to produce an identical string.
 */
let craftingMethods: string | null = null;
const toolsetPrompt = (): string =>
  (craftingMethods ??= craftingToolsetPrompt(currenciesDataset));

export function buildSystemPrompt(extraInstructions?: string): string {
  if (!extraInstructions || extraInstructions.trim().length === 0) return systemTemplate;

  // User instructions are appended, never prepended: the hard rules above them
  // stay in force, and a custom prompt cannot quietly become the whole system
  // prompt.
  return `${systemTemplate}\n\n## Additional instructions from the user\n\n${extraInstructions.trim()}\n`;
}

/**
 * System prompt for providers without a schema-enforcement parameter.
 *
 * Claude constrains the response with `output_config.format`, so its prompt says
 * nothing about JSON. Everywhere else the shape has to be asked for in words —
 * hence the extra section. It sits *above* any user instructions, so a custom
 * prompt cannot talk the model out of the output format.
 */
export function buildJsonSystemPrompt(extraInstructions?: string): string {
  const base = `${systemTemplate}\n\n${jsonOutputTemplate}`;
  if (!extraInstructions || extraInstructions.trim().length === 0) return base;
  return `${base}\n\n## Additional instructions from the user\n\n${extraInstructions.trim()}\n`;
}

export function buildCraftPrompt({ item, deterministic, context }: NarrativeRequest): string {
  const affixes = affixMods(item);
  const budget = affixBudget(item.rarity);

  return render(craftTemplate, {
    itemText: item.raw.trim(),
    rarity: item.rarity,
    itemLevel: item.itemLevel === null ? 'unknown' : String(item.itemLevel),
    affixSummary:
      budget === null
        ? `${affixes.length} (rarity has no affix budget)`
        : `${affixes.length} of ${budget}`,
    modifierList: bullets(item.mods.map(describeMod), 'no modifiers'),
    score: String(deterministic.score),
    strengths: bullets(deterministic.strengths),
    weaknesses: bullets(deterministic.weaknesses),
    recommendations: bullets(
      deterministic.recommendations.map(
        (rec) => `${rec.action} — ${rec.label} (risk: ${rec.risk}). ${rec.reasoning}`,
      ),
      'no rule matched this item',
    ),
    craftingMethods: toolsetPrompt(),
    modifierPool: describePool(item),
    craftIntent:
      context.craftIntent ??
      'The player did not say. Assume a practical, cost-aware improvement and note that you assumed it.',
    league: context.league,
    characterClass: orUnknown(context.characterClass),
    ascendancy: orUnknown(context.ascendancy),
    mainSkill: orUnknown(context.mainSkill),
    goal: orUnknown(context.goal),
  });
}
