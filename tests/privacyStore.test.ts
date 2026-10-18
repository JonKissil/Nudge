import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { AppStore } from '../src/main/store'
import { defaultPrivacySettings } from '../src/shared/privacy'

describe('privacy settings storage', () => {
  it('migrates safely, persists restrictions alongside existing data, and rejects malformed settings independently', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nudge-privacy-'))
    const path = join(directory, 'state.json')
    try {
      const allowList = [{ kind: 'bundle', value: 'com.apple.TextEdit' }]
      await writeFile(path, JSON.stringify({ version: 1, allowList }))
      const store = new AppStore(path, vi.fn())
      expect(store.privacy).toEqual(defaultPrivacySettings())
      await Promise.all([store.setPrivacy({ ...defaultPrivacySettings(), excludedDomains: ['private.test'],
        masks: [{ x: 0, y: 0, w: 0.2, h: 0.2 }] }), store.setGeminiGrace(false)])
      const restored = new AppStore(path, vi.fn())
      expect(restored.privacy.excludedDomains).toEqual(['private.test'])
      expect(restored.privacy.masks).toHaveLength(1)
      expect(restored.geminiGrace).toBe(false)
      expect(restored.allowList).toEqual(allowList)
      const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
      await writeFile(path, JSON.stringify({ ...raw, privacy: { approvedOnly: false, broken: true } }))
      const recovered = new AppStore(path, vi.fn())
      expect(recovered.privacy).toEqual(defaultPrivacySettings())
      expect(recovered.allowList).toEqual(allowList)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
})
