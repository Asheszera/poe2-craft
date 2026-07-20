import { affixBudget, affixMods, type ItemMod } from '@poe2/models';
import craftTemplate from '../prompts/craft.md?raw';
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

/** Renders a modifier the way the prompt should see it — uncertainty included. */
function describeMod(mod: ItemMod): string {
  const affix = mod.affixType === 'unknown' ? mod.category : `${mod.category}/${mod.affixType}`;
  if (!mod.tier) {
    return `${mod.text} [${affix}, tier unresolved${mod.matched ? '' : ', unknown modifier'}]`;
  }
  const tier = `T${mod.tier.value}${mod.tier.total === null ? '' : `/${mod.tier.total}`}`;
  const hedge = mod.tier.confidence === 'ambiguous' ? ' (uncertain)' : '';
  return `${mod.text} [${affix}, ${tier}${hedge}${mod.tier.name ? `, ${mod.tier.name}` : ''}]`;
}

const orUnknown = (value: string | null): string => value ?? 'unknown';

export function buildSystemPrompt(extraInstructions?: string): string {
  if (!extraInstructions || extraInstructions.trim().length === 0) return systemTemplate;

  // User instructions are appended, never prepended: the hard rules above them
  // stay in force, and a custom prompt cannot quietly become the whole system
  // prompt.
  return `${systemTemplate}\n\n## Additional instructions from the user\n\n${extraInstructions.trim()}\n`;
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
    league: context.league,
    characterClass: orUnknown(context.characterClass),
    ascendancy: orUnknown(context.ascendancy),
    mainSkill: orUnknown(context.mainSkill),
    goal: orUnknown(context.goal),
  });
}
