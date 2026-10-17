import type { WindowInfo } from '../../shared/types'

/** Keep the native helper's Apple Events requests from overlapping across poll and lock. */
export function queueWindowReads(
  read: () => Promise<WindowInfo | undefined>,
): () => Promise<WindowInfo | undefined> {
  let tail: Promise<unknown> = Promise.resolve()
  return () => {
    const result = tail.then(read)
    // A failed read must not prevent the next request from running.
    tail = result.catch(() => undefined)
    return result
  }
}
