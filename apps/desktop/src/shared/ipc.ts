import {
  BuildVerdictSchema,
  HistoryEntrySchema,
  HistoryStatsSchema,
  ItemAnalysisSchema,
  NarrativeAnalysisSchema,
} from '@poe2/models';
import { z } from 'zod';
import { SettingsPatchSchema, SettingsViewSchema } from './settings.js';
import type { IpcChannel, IpcEvent } from './channels.js';

export {
  IPC_CHANNELS,
  IPC_EVENTS,
  isIpcChannel,
  isIpcEvent,
  type IpcChannel,
  type IpcEvent,
} from './channels.js';

/**
 * The single source of truth for every main ↔ renderer message.
 *
 * Each channel declares a zod schema for its request and its response. Main
 * validates the request before dispatching (the renderer is the least trusted
 * process in the app), and the renderer validates the response, which turns a
 * contract drift into a loud error at the boundary instead of `undefined`
 * surfacing three components deep.
 */

/**
 * One modifier the base can still roll.
 *
 * Declared here rather than imported from `@poe2/data` so the renderer can type
 * the response without pulling the 4 MB knowledge base into its bundle.
 */
export const PoolOptionSchema = z.object({
  type: z.string(),
  key: z.string(),
  text: z.string(),
  bestTier: z.number().int(),
  tierTotal: z.number().int(),
  requiredLevel: z.number().int(),
  topTierLevel: z.number().int().nullable(),
  /** What the modifier is about: `life`, `attack`, `caster`, `elemental`, … */
  tags: z.array(z.string()),
  /**
   * The exclusion group a modifier already on the item occupies, when this
   * option shares it — meaning the item can no longer roll it.
   */
  blockedBy: z.string().nullable(),
  /** Tiers of this ladder the item level allows. */
  eligibleTiers: z.number().int(),
  /** Published spawn weight summed over eligible tiers; null when unpublished. */
  weight: z.number().nullable(),
  /**
   * Chance this modifier is the one that lands, 0–1. Null when no weight is
   * published for it — rendered as "unknown", never as a small number.
   */
  chance: z.number().nullable(),
});
export type PoolOption = z.infer<typeof PoolOptionSchema>;

/** `AppError` minus `cause`, which is not structured-cloneable over IPC. */
export const SerializableErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type SerializableError = z.infer<typeof SerializableErrorSchema>;

/** Mirrors `Result<T, AppError>` in a form zod can discriminate. */
export const resultSchema = <T extends z.ZodTypeAny>(value: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value }),
    z.object({ ok: z.literal(false), error: SerializableErrorSchema }),
  ]);

export const ipcContract = {
  'app:info': {
    request: z.null(),
    response: z.object({
      version: z.string(),
      platform: z.string(),
      electron: z.string(),
    }),
  },
  /** Parses arbitrary text. Used by the manual paste flow. */
  'item:parse': {
    request: z.object({ raw: z.string() }),
    response: resultSchema(ItemAnalysisSchema),
  },
  /**
   * Reads the system clipboard and parses it in one round trip.
   *
   * Deliberately not two calls: the renderer never needs the raw clipboard, and
   * keeping it in main means arbitrary clipboard content is never handed to the
   * least-trusted process.
   */
  'clipboard:parse': {
    request: z.null(),
    response: resultSchema(ItemAnalysisSchema),
  },
  /** Whether the background clipboard watcher is currently polling. */
  'clipboard:getWatch': {
    request: z.null(),
    response: z.object({ enabled: z.boolean() }),
  },
  'clipboard:setWatch': {
    request: z.object({ enabled: z.boolean() }),
    response: z.object({ enabled: z.boolean() }),
  },

  'settings:get': {
    request: z.null(),
    /** Never includes the API key — only whether one is stored. */
    response: SettingsViewSchema,
  },
  'settings:update': {
    request: SettingsPatchSchema,
    response: resultSchema(SettingsViewSchema),
  },

  /**
   * Layer 2. Takes the item's raw text rather than an analysis object: main
   * re-derives the deterministic analysis itself (sub-millisecond) so the model
   * can only ever be asked to explain something main computed. Accepting an
   * analysis from the renderer would let it dictate what the model "explains".
   */
  'ai:narrate': {
    request: z.object({
      raw: z.string(),
      /**
       * What the player wants from this item. Renderer-supplied, unlike the
       * analysis: it is the user stating a preference, not dictating a finding.
       * It reaches the model as context, below the system prompt's hard rules.
       */
      craftIntent: z.string().nullable(),
    }),
    response: resultSchema(NarrativeAnalysisSchema),
  },

  'history:list': {
    request: z.object({ limit: z.number().int().positive().max(200), offset: z.number().int().min(0) }),
    response: z.array(HistoryEntrySchema),
  },
  'history:stats': { request: z.null(), response: HistoryStatsSchema },
  /**
   * Records notes or a sale on a stored entry.
   *
   * `null` clears a field and an absent field leaves it alone: clearing a
   * recorded sale is a real action and must not look like silence.
   */
  'history:update': {
    request: z.object({
      id: z.number().int().positive(),
      notes: z.string().nullable().optional(),
      soldFor: z.number().positive().nullable().optional(),
      soldCurrency: z.string().nullable().optional(),
    }),
    response: HistoryEntrySchema.nullable(),
  },
  'history:remove': { request: z.object({ id: z.number().int().positive() }), response: z.null() },
  'history:clear': { request: z.null(), response: z.null() },

  /**
   * What the item's base can still roll.
   *
   * A separate channel rather than a field on `ItemAnalysis`: the pool runs to
   * dozens of entries per side and is only wanted on the Craft Advisor screen,
   * so putting it in every analysis payload would tax the common path for the
   * rare one.
   */
  'craft:pool': {
    request: z.object({ raw: z.string() }),
    response: z.object({
      /** False when the base is not in the dataset — say so, never guess. */
      known: z.boolean(),
      baseType: z.string(),
      itemLevel: z.number().int().nullable(),
      prefix: z.array(PoolOptionSchema),
      suffix: z.array(PoolOptionSchema),
      /**
       * `weights` — the game's published spawn weights. `tiers` — the stand-in
       * used for bases with none, where each reachable tier counts equally.
       */
      chanceBasis: z.enum(['weights', 'tiers']),
      /** Templates already on the item, so the UI can mark them as taken. */
      present: z.array(z.string()),
    }),
  },

  /**
   * Judges the item against the configured build.
   *
   * Its own channel, and its own score: this is a model's opinion about skills
   * and scaling, which no dataset here can check. Returning it alongside the
   * deterministic score would invite the interface to blend the two.
   */
  'build:evaluate': {
    request: z.object({ raw: z.string() }),
    response: resultSchema(BuildVerdictSchema),
  },

  /**
   * Sends a fixed, minimal item through the whole AI path so the current
   * provider settings can be verified without needing a real item — and,
   * critically, surfaces the provider's own error text in the interface rather
   * than only in the terminal.
   */
  'ai:test': {
    request: z.null(),
    response: resultSchema(
      z.object({
        provider: z.string(),
        model: z.string(),
        elapsedMs: z.number(),
        sample: z.string(),
      }),
    ),
  },
} as const satisfies Record<IpcChannel, { request: z.ZodTypeAny; response: z.ZodTypeAny }>;

export type IpcContract = typeof ipcContract;

export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]['request']>;
export type IpcResponse<C extends IpcChannel> = z.infer<IpcContract[C]['response']>;

/**
 * Main → renderer pushes. Only the payload schema is needed: these are
 * fire-and-forget, so there is no response to validate.
 */
export const ipcEvents = {
  /** A clipboard copy was recognised as an item and analysed successfully. */
  'item:captured': ItemAnalysisSchema,
  /** Sent only to the overlay window, which renders it and hides itself. */
  'overlay:show': ItemAnalysisSchema,
} as const satisfies Record<IpcEvent, z.ZodTypeAny>;

export type IpcEventPayload<E extends IpcEvent> = z.infer<(typeof ipcEvents)[E]>;
