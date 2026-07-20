import { ParsedItemSchema } from '@poe2/models';
import { z } from 'zod';
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
    response: resultSchema(ParsedItemSchema),
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
    response: resultSchema(ParsedItemSchema),
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
} as const satisfies Record<IpcChannel, { request: z.ZodTypeAny; response: z.ZodTypeAny }>;

export type IpcContract = typeof ipcContract;

export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]['request']>;
export type IpcResponse<C extends IpcChannel> = z.infer<IpcContract[C]['response']>;

/**
 * Main → renderer pushes. Only the payload schema is needed: these are
 * fire-and-forget, so there is no response to validate.
 */
export const ipcEvents = {
  /** A clipboard copy was recognised as an item and parsed successfully. */
  'item:captured': ParsedItemSchema,
} as const satisfies Record<IpcEvent, z.ZodTypeAny>;

export type IpcEventPayload<E extends IpcEvent> = z.infer<(typeof ipcEvents)[E]>;
