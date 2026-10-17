import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionState, WindowInfo } from '../src/shared/types'
import { TaskRecovery } from '../src/main/session/taskRecovery'
import type { SavedTaskTab } from '../src/main/session/taskUrl'

const locked: WindowInfo = { app: 'Safari', bundleId: 'com.apple.Safari', title: 'Essay',
  url: 'https://example.com/essay?view=1', bounds: { x: 0, y: 0, width: 1280, height: 800 } }

function fixture() {
  vi.useFakeTimers()
  let phase: SessionState = 'FOCUSED'
  const read = vi.fn<() => Promise<string | undefined>>().mockResolvedValue('https://example.com/essay?view=2#paragraph3')
  const update = vi.fn(async () => {})
  const save = vi.fn(async (task: SavedTaskTab | undefined) => { void task })
  const log = vi.fn()
  const recovery = new TaskRecovery({ getPhase: () => phase, readUrl: read, updateUrl: update, save, log })
  return { recovery, read, update, save, log, phase: (value: SessionState) => { phase = value } }
}

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('periodic task recovery', () => {
  it('saves at lock and refreshes after 10 seconds, keeping the URL when the tab closes', async () => {
    const f = fixture()
    f.recovery.start(locked)
    expect(f.save).toHaveBeenCalledWith(expect.objectContaining({ url: locked.url }))
    await vi.advanceTimersByTimeAsync(9999)
    expect(f.read).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(f.update).toHaveBeenCalledWith('https://example.com/essay?view=2#paragraph3')
    expect(f.save).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://example.com/essay?view=2#paragraph3' }))
    f.read.mockResolvedValue(undefined)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(f.save).toHaveBeenCalledTimes(2)
    f.recovery.dispose()
  })

  it('never replaces the task with a distraction and does not read while paused or checking in', async () => {
    const f = fixture()
    f.recovery.start(locked)
    f.read.mockResolvedValue('https://example.com/videos')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(f.update).not.toHaveBeenCalled()
    expect(f.save).toHaveBeenCalledTimes(1)
    f.phase('PAUSED'); await vi.advanceTimersByTimeAsync(10_000)
    f.phase('CHECKIN'); await vi.advanceTimersByTimeAsync(10_000)
    expect(f.read).toHaveBeenCalledTimes(1)
    f.recovery.dispose()
  })

  it('does not overlap reads or restore an old checkpoint after End or a new task', async () => {
    const f = fixture()
    let finish!: (url: string) => void
    f.read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    f.recovery.start(locked)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(f.read).toHaveBeenCalledOnce()
    f.recovery.stop()
    const next = { ...locked, url: 'https://example.com/new-task' }
    f.recovery.start(next)
    finish('https://example.com/essay?view=3')
    await vi.advanceTimersByTimeAsync(1)
    expect(f.update).not.toHaveBeenCalled()
    expect(f.save).toHaveBeenLastCalledWith(expect.objectContaining({ url: next.url }))
    f.recovery.dispose()
  })

  it('keeps recovering after a permission or persistence failure', async () => {
    const f = fixture()
    f.save.mockRejectedValueOnce(new Error('Disk full'))
    f.read.mockRejectedValueOnce(new Error('Apple Events unavailable'))
    f.recovery.start(locked)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(f.log).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(f.update).toHaveBeenCalledOnce()
    expect(f.save).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://example.com/essay?view=2#paragraph3' }))
    f.recovery.dispose()
  })
})
