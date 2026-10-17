const OFFLINE_RETRY_MS = [15_000, 30_000, 60_000] as const

/** Deadline for SDK connections that never resolve; close any socket that arrives late. */
export async function connectWithin<T>(
  pending: Promise<T>, ms: number, isCurrent: () => boolean,
  invalidate: () => void, close: (value: T) => void,
): Promise<T> {
  let expired = false
  const guarded = pending.then((value) => {
    if (expired || !isCurrent()) {
      close(value)
      throw new Error('Obsolete Live connection')
    }
    return value
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true
      invalidate()
      reject(new Error('Live connection timed out'))
    }, ms)
  })
  try { return await Promise.race([guarded, timeout]) }
  finally { clearTimeout(timer) }
}

/** Recovery and response deadlines are cancelled when a study session ends. */
export class LiveTiming {
  private retryTimer?: ReturnType<typeof setTimeout>
  private turnTimer?: ReturnType<typeof setTimeout>
  private offlineCycles = 0

  resetCycles(): void { this.offlineCycles = 0 }

  clearRetry(): void { clearTimeout(this.retryTimer); this.retryTimer = undefined }
  clearTurn(): void { clearTimeout(this.turnTimer); this.turnTimer = undefined }
  clear(): void { this.clearRetry(); this.clearTurn() }

  retryWhileActive(isActive: () => boolean, retry: () => void): void {
    if (this.retryTimer || !isActive()) return
    const delay = OFFLINE_RETRY_MS[Math.min(this.offlineCycles++, OFFLINE_RETRY_MS.length - 1)]
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      if (isActive()) retry()
    }, delay)
    this.retryTimer.unref?.()
  }

  watchTurn(ms: number, isPending: () => boolean, recover: () => void): void {
    this.clearTurn()
    this.turnTimer = setTimeout(() => {
      this.turnTimer = undefined
      if (isPending()) recover()
    }, ms)
    this.turnTimer.unref?.()
  }
}
