import { ipcMain } from 'electron';
import type { AppError, Result } from '@poe2/shared';
import {
  ipcContract,
  type IpcChannel,
  type IpcRequest,
  type IpcResponse,
  type SerializableError,
} from '../../shared/ipc.js';

export type IpcHandler<C extends IpcChannel> = (
  payload: IpcRequest<C>,
) => IpcResponse<C> | Promise<IpcResponse<C>>;

export type IpcHandlers = { [C in IpcChannel]: IpcHandler<C> };

/** Drops `cause`, which frequently holds non-cloneable values (Error, streams). */
export const toSerializable = (error: AppError): SerializableError => ({
  code: error.code,
  message: error.message,
  ...(error.details ? { details: error.details } : {}),
});

/** Converts a domain `Result` into its wire representation. */
export const serializeResult = <T>(result: Result<T>): { ok: true; value: T } | { ok: false; error: SerializableError } =>
  result.ok ? { ok: true, value: result.value } : { ok: false, error: toSerializable(result.error) };

/**
 * Wires every declared channel to its handler.
 *
 * Requests are validated against the contract before the handler runs, and any
 * thrown error is converted into a rejected invoke with a stable code — the
 * renderer must never receive a raw stack trace.
 */
export function registerIpcHandlers(handlers: IpcHandlers): void {
  for (const channel of Object.keys(ipcContract) as IpcChannel[]) {
    ipcMain.handle(channel, async (_event, rawPayload: unknown) => {
      const parsed = ipcContract[channel].request.safeParse(rawPayload ?? null);
      if (!parsed.success) {
        throw new Error(`[ipc] invalid payload for "${channel}": ${parsed.error.message}`);
      }

      const handler = handlers[channel] as IpcHandler<typeof channel>;
      return await handler(parsed.data);
    });
  }
}
