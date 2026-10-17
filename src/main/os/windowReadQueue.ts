import type { WindowInfo } from '../../shared/types'

/** Keep the native helper's Apple Events requests from overlapping across poll and lock. */
export class NativeReadQueue {
  private tail: Promise<unknown> = Promise.resolve()

  run<T>(read: () => Promise<T>): Promise<T> {
    const result = this.tail.then(read)
    // A failed read must not prevent the next request from running.
    this.tail = result.catch(() => undefined)
    return result
  }
}

export function queueWindowReads(read: () => Promise<WindowInfo | undefined>): () => Promise<WindowInfo | undefined> {
  const queue = new NativeReadQueue()
  return () => queue.run(read)
}
