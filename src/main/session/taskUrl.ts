import { z } from 'zod'
import type { WindowInfo } from '../../shared/types'
import { isBrowser, matchWindow } from '../drift/matchWindow'

export const SavedTaskTabSchema = z.strictObject({
  app: z.string().min(1), bundleId: z.string(), title: z.string(),
  url: z.url().refine((value) => /^https?:\/\//iu.test(value)),
  savedAt: z.number().nonnegative(),
})
export type SavedTaskTab = z.infer<typeof SavedTaskTabSchema>
export const TASK_URL_REFRESH_MS = 10_000

/** A query/hash or Docs view change is safe; drifting to a different page is not. */
export function refreshedTaskUrl(locked: WindowInfo, candidate: string): string | undefined {
  try {
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol) || !isBrowser(locked)) return undefined
    return matchWindow({ ...locked, url: url.href }, locked) ? url.href : undefined
  } catch { return undefined }
}

export function savedTaskTab(window: WindowInfo, now: number): SavedTaskTab | undefined {
  const url = window.url && refreshedTaskUrl(window, window.url)
  return url ? SavedTaskTabSchema.parse({ app: window.app, bundleId: window.bundleId, title: window.title, url, savedAt: now }) : undefined
}
