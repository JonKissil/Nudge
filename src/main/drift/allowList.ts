import { z } from 'zod'
import { AllowListEntrySchema, ThemeSchema, type AllowListEntry, type WindowInfo } from '../../shared/types'
import { isBrowser } from './matchWindow'
import { SavedTaskTabSchema } from '../session/taskUrl'

export const StoredStateSchema = z.strictObject({
  version: z.literal(1), allowList: z.array(AllowListEntrySchema).max(1000),
  lockedTask: SavedTaskTabSchema.optional(),
  theme: ThemeSchema.optional(),
})
export type StoredState = z.infer<typeof StoredStateSchema>

export function allowListEntry(window: WindowInfo): AllowListEntry {
  if (isBrowser(window)) {
    if (!window.url) throw new Error('The current browser URL is unavailable.')
    const url = new URL(window.url)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only web pages can be allowed in a browser.')
    url.hash = ''
    return { kind: 'url-prefix', value: url.href }
  }
  if (!window.bundleId) throw new Error('The current application could not be identified.')
  return { kind: 'bundle', value: window.bundleId }
}

export function addAllowedWindow(state: StoredState, window: WindowInfo): StoredState {
  const entry = allowListEntry(window)
  if (state.allowList.some((item) => item.kind === entry.kind && item.value === entry.value)) return state
  return StoredStateSchema.parse({ ...state, allowList: [...state.allowList, entry] })
}
