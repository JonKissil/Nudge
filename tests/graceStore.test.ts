import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AppStore } from '../src/main/store'

describe('local timing history', () => {
  it('loads old state, preserves allowances, bounds concurrent saves, and persists opt-out/reset', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nudge-grace-'))
    const path = join(directory, 'state.json')
    const allowList = [{ kind: 'bundle', value: 'com.apple.TextEdit' }]
    try {
      await writeFile(path, JSON.stringify({ version: 1, allowList }))
      const store = new AppStore(path, vi.fn())
      expect(store.adaptiveGrace).toBe(true)
      expect(store.graceHistory).toEqual([])
      await Promise.all(Array.from({ length: 25 }, (_, i) => store.recordGraceReturn(10_000 + i * 1_000)))
      const reloaded = new AppStore(path, vi.fn())
      expect(reloaded.allowList).toEqual(allowList)
      expect(reloaded.graceHistory).toHaveLength(20)
      expect(reloaded.graceHistory[0]).toBe(15_000)
      await reloaded.setAdaptiveGrace(false)
      await reloaded.recordGraceReturn(90_000)
      expect(reloaded.graceHistory.at(-1)).toBe(34_000)
      await reloaded.resetGraceHistory()
      const saved = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
      expect(saved).toEqual({ version: 1, allowList, adaptiveGrace: false, graceHistory: [],
        habits: { revision: 1, events: [] } })
      expect(new AppStore(path, vi.fn()).adaptiveGrace).toBe(false)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('discards malformed timing history without discarding the allow-list', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nudge-grace-'))
    const path = join(directory, 'state.json')
    try {
      await writeFile(path, JSON.stringify({ version: 1, allowList: [{ kind: 'bundle', value: 'com.apple.TextEdit' }],
        graceHistory: ['invalid', -10], adaptiveGrace: false }))
      const store = new AppStore(path, vi.fn())
      expect(store.graceHistory).toEqual([])
      expect(store.allowList).toHaveLength(1)
      expect(store.adaptiveGrace).toBe(false)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
})
