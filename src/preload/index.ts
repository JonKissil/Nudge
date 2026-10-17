import { ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { z } from 'zod'
import { IpcSchemas, type IpcChannel, type IpcPayload } from '../shared/ipc'
import { ActionResultSchema } from '../shared/types'

export function send<C extends IpcChannel>(channel: C, payload: IpcPayload<C>): void {
  ipcRenderer.send(channel, IpcSchemas[channel].parse(payload))
}

export function subscribe<T>(channel: IpcChannel, schema: z.ZodType<T>, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: unknown): void => {
    const result = schema.safeParse(payload)
    if (result.success) listener(result.data)
    else console.error(`Invalid incoming IPC payload: ${channel}`)
  }
  ipcRenderer.on(channel, handler)
  return () => { ipcRenderer.removeListener(channel, handler) }
}

export async function invokeAction<C extends IpcChannel>(channel: C, payload: IpcPayload<C>) {
  const result: unknown = await ipcRenderer.invoke(channel, IpcSchemas[channel].parse(payload))
  return ActionResultSchema.parse(result)
}
