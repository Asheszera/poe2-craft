import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { isIpcChannel, isIpcEvent, IPC_CHANNELS, IPC_EVENTS } from '../shared/channels.js';

/**
 * The entire renderer-visible API surface.
 *
 * `ipcRenderer` itself is never exposed. Both whitelists are derived from the
 * contract, so adding a channel there is the only way to add one here — there
 * is no path to invoke an arbitrary main-process handler or to subscribe to an
 * internal Electron channel.
 */
const api = {
  channels: IPC_CHANNELS,
  events: IPC_EVENTS,

  invoke: (channel: string, payload: unknown): Promise<unknown> => {
    if (!isIpcChannel(channel)) {
      return Promise.reject(new Error(`[ipc] channel "${channel}" is not in the contract`));
    }
    return ipcRenderer.invoke(channel, payload ?? null);
  },

  /**
   * Subscribes to a main-process event. Returns an unsubscribe function.
   *
   * The Electron `IpcRendererEvent` is deliberately not forwarded: it carries
   * `sender` and ports that the renderer has no business holding.
   */
  on: (event: string, listener: (payload: unknown) => void): (() => void) => {
    if (!isIpcEvent(event)) {
      throw new Error(`[ipc] event "${event}" is not in the contract`);
    }
    const handler = (_e: IpcRendererEvent, payload: unknown): void => listener(payload);
    ipcRenderer.on(event, handler);
    return () => ipcRenderer.removeListener(event, handler);
  },
};

export type PreloadApi = typeof api;

contextBridge.exposeInMainWorld('poe2', api);
