import { z } from 'zod';

/**
 * User settings.
 *
 * Split deliberately in two: `AppSettings` is everything safe to hand to the
 * renderer, and the API key lives outside it. The key is stored encrypted and
 * is only ever readable inside the main process — see `settings/store.ts`.
 */
export const AppSettingsSchema = z.object({
  // --- analysis context, fed to the rules engine and the prompt -------------
  league: z.string().default('Standard'),
  characterClass: z.string().nullable().default(null),
  ascendancy: z.string().nullable().default(null),
  mainSkill: z.string().nullable().default(null),
  goal: z.string().nullable().default(null),

  // --- AI ------------------------------------------------------------------
  aiProvider: z.string().default('anthropic'),
  aiModel: z.string().default('claude-opus-4-8'),
  aiEffort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('low'),
  /** Appended below the built-in system prompt, never in place of it. */
  aiCustomPrompt: z.string().default(''),
  /**
   * Whether to narrate automatically after every capture. Off by default: the
   * deterministic analysis is free and instant, a model call is neither.
   */
  aiAutoNarrate: z.boolean().default(false),

  // --- capture -------------------------------------------------------------
  clipboardWatch: z.boolean().default(true),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = AppSettingsSchema.parse({});

/** What the renderer is allowed to know about credentials: whether one exists. */
export const SettingsViewSchema = AppSettingsSchema.extend({
  hasApiKey: z.boolean(),
});
export type SettingsView = z.infer<typeof SettingsViewSchema>;

/**
 * A settings patch. `apiKey` is write-only — it can be sent in, never read out.
 * An empty string clears the stored key.
 */
export const SettingsPatchSchema = AppSettingsSchema.partial().extend({
  apiKey: z.string().optional(),
});
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;
