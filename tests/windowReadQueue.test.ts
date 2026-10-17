import { describe, expect, it, vi } from 'vitest'
import { queueWindowReads } from '../src/main/os/windowReadQueue'
import type { WindowInfo } from '../src/shared/types'

const window: WindowInfo = {
  app: 'Safari', bundleId: 'com.apple.Safari', title: 'History essay',
  url: 'https://example.com/essay', bounds: { x: 0, y: 0, width: 100, height: 100 },
}

describe('native window read queue', () => {
  it('gives the lock a fresh read after an in-flight poll finishes', async () => {
    let finishPoll!: (value: WindowInfo) => void
    const pollResult = new Promise<WindowInfo>((resolve) => { finishPoll = resolve })
    const changed = { ...window, url: 'https://example.com/research' }
    const read = vi.fn<() => Promise<WindowInfo | undefined>>()
      .mockReturnValueOnce(pollResult).mockResolvedValueOnce(changed)
    const queued = queueWindowReads(read)

    const poll = queued()
    const lock = queued()
    await Promise.resolve()
    expect(read).toHaveBeenCalledTimes(1)
    finishPoll(window)
    expect(await poll).toEqual(window)
    expect(await lock).toEqual(changed)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('allows a later read to succeed after an earlier failure', async () => {
    const read = vi.fn<() => Promise<WindowInfo | undefined>>()
      .mockRejectedValueOnce(new Error('Native helper failed')).mockResolvedValueOnce(window)
    const queued = queueWindowReads(read)
    const failed = queued()
    const next = queued()
    await expect(failed).rejects.toThrow('Native helper failed')
    expect(await next).toEqual(window)
  })
})
