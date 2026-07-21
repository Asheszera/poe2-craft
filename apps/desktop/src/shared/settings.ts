import { z } from 'zod';

/**
 * User settings.
 *
 * Split deliberately in two: `AppSettings` is everything safe to hand to the
 * renderer, and the API key lives outside it. The key is stored encrypted and
 * is only ever readable inside the main process — see `settings/store.ts`.
 */
/**
 * Field schemas, declared **without** defaults.
 *
 * Defaults belong to `DEFAULT_SETTINGS`, not to the schema. A `.default()` here
 * would be applied when validating a *partial* patch too, turning
 * `{ league: 'X' }` into "league X plus every other field reset to its default"
 * — which is exactly how filling one field came to clear the others.
 */
const FIELDS = {
  // --- analysis context, fed to the rules engine and the prompt -------------
  league: z.string(),
  characterClass: z.string().nullable(),
  ascendancy: z.string().nullable(),
  mainSkill: z.string().nullable(),
  goal: z.string().nullable(),

  // --- AI ------------------------------------------------------------------
  aiProvider: z.string(),
  /**
   * Model overrides per provider, falling back to each preset's default.
   * Keyed by provider so switching back and forth does not lose the choice.
   */
  aiModelByProvider: z.record(z.string(), z.string()),
  /** Endpoint overrides per provider — for self-hosted or proxied setups. */
  aiBaseUrlByProvider: z.record(z.string(), z.string()),
  aiEffort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']),
  /** Appended below the built-in system prompt, never in place of it. */
  aiCustomPrompt: z.string(),
  /**
   * Whether to narrate automatically after every capture. Off by default: the
   * deterministic analysis is free and instant, a model call is neither.
   */
  aiAutoNarrate: z.boolean(),

  // --- economy -------------------------------------------------------------
  /**
   * Currency prices in Exalted Orbs, keyed by the game's own name.
   *
   * Entered by the player from the in-game currency exchange. Nothing ships a
   * default: an invented rate is indistinguishable from a real one by the time
   * it reaches the advice.
   */
  currencyPrices: z.record(z.string(), z.number().positive()),

  // --- capture -------------------------------------------------------------
  clipboardWatch: z.boolean(),
} as const;

/** Complete settings. Callers always supply every field (merged over defaults). */
export const AppSettingsSchema = z.object(FIELDS);
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = {
  league: 'Standard',
  characterClass: null,
  ascendancy: null,
  mainSkill: null,
  goal: null,
  aiProvider: 'gemini',
  aiModelByProvider: {},
  aiBaseUrlByProvider: {},
  aiEffort: 'low',
  aiCustomPrompt: '',
  aiAutoNarrate: false,
  currencyPrices: {},
  clipboardWatch: true,
};

/**
 * What the renderer is allowed to know about credentials: which providers have
 * one stored. Never a key, never a fragment of one.
 */
export const SettingsViewSchema = AppSettingsSchema.extend({
  configuredProviders: z.array(z.string()),
});
export type SettingsView = z.infer<typeof SettingsViewSchema>;

/**
 * A settings patch. `setApiKey` is write-only — it can be sent in, never read
 * out, because no channel returns it. An empty `key` clears that provider's
 * stored credential.
 */
export const SettingsPatchSchema = z.object(FIELDS).partial().extend({
  setApiKey: z.object({ provider: z.string().min(1), key: z.string() }).optional(),
});
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;
