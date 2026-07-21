/**
 * The channel whitelists, deliberately free of any dependency.
 *
 * The preload runs in a privileged context and is the bridge into the renderer;
 * it must stay as small and as auditable as possible. Importing the zod-based
 * contract here would pull the entire schema layer (~150 kB) into that
 * privileged bundle for the sake of two lists of strings.
 *
 * `ipcContract` / `ipcEvents` are declared `satisfies Record<…>`, so a channel
 * added there without being added here is a compile error.
 */

/** Renderer → main, request/response. */
export const IPC_CHANNELS = [
  'app:info',
  'item:parse',
  'clipboard:parse',
  'clipboard:getWatch',
  'clipboard:setWatch',
  'settings:get',
  'settings:update',
  'ai:narrate',
  'ai:test',
  'history:list',
  'history:stats',
  'history:remove',
  'history:clear',
] as const;

/** Main → renderer, fire-and-forget. */
export const IPC_EVENTS = ['item:captured'] as const;

export type IpcChannel = (typeof IPC_CHANNELS)[number];
export type IpcEvent = (typeof IPC_EVENTS)[number];

const CHANNEL_SET: ReadonlySet<string> = new Set(IPC_CHANNELS);
const EVENT_SET: ReadonlySet<string> = new Set(IPC_EVENTS);

export const isIpcChannel = (value: unknown): value is IpcChannel =>
  typeof value === 'string' && CHANNEL_SET.has(value);

export const isIpcEvent = (value: unknown): value is IpcEvent =>
  typeof value === 'string' && EVENT_SET.has(value);
