import {
  ipcContract,
  ipcEvents,
  type IpcChannel,
  type IpcEvent,
  type IpcEventPayload,
  type IpcRequest,
  type IpcResponse,
} from '@shared/ipc';

declare global {
  interface Window {
    poe2: {
      channels: readonly string[];
      events: readonly string[];
      invoke: (channel: string, payload: unknown) => Promise<unknown>;
      on: (event: string, listener: (payload: unknown) => void) => () => void;
    };
  }
}

/**
 * Typed IPC client.
 *
 * The response is validated against the contract before it reaches React.
 * Slightly redundant given main builds it from the same schemas — but it makes
 * a version mismatch between a stale renderer and a fresh main process fail
 * loudly at the boundary rather than corrupting component state.
 */
export async function invoke<C extends IpcChannel>(
  channel: C,
  payload: IpcRequest<C>,
): Promise<IpcResponse<C>> {
  const raw = await window.poe2.invoke(channel, payload);
  const parsed = ipcContract[channel].response.safeParse(raw);

  if (!parsed.success) {
    throw new Error(`[ipc] malformed response from "${channel}": ${parsed.error.message}`);
  }
  return parsed.data as IpcResponse<C>;
}

/**
 * Subscribes to a main-process event. Returns the unsubscribe function, shaped
 * to be returned directly from a `useEffect`.
 *
 * A malformed payload is logged and dropped rather than thrown: this runs
 * inside an Electron listener where a throw has no useful handler and would
 * leave the subscription in an undefined state.
 */
export function subscribe<E extends IpcEvent>(
  event: E,
  listener: (payload: IpcEventPayload<E>) => void,
): () => void {
  return window.poe2.on(event, (raw) => {
    const parsed = ipcEvents[event].safeParse(raw);
    if (!parsed.success) {
      console.error(`[ipc] malformed payload on "${event}"`, parsed.error);
      return;
    }
    listener(parsed.data);
  });
}
