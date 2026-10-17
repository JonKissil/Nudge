import { describe, expect, it } from 'vitest'
import type { WindowInfo } from '../src/shared/types'
import { refreshedTaskUrl, savedTaskTab, SavedTaskTabSchema } from '../src/main/session/taskUrl'
import { StoredStateSchema } from '../src/main/drift/allowList'

const locked: WindowInfo = { app: 'Safari', bundleId: 'com.apple.Safari', title: 'Essay',
  url: 'https://docs.google.com/document/d/abc/edit', bounds: { x: 0, y: 0, width: 1280, height: 800 } }

describe('saved task URLs', () => {
  it('preserves full URLs when a Docs view, query, or fragment changes', () => {
    const url = 'https://docs.google.com/document/d/abc/preview?tab=t.2#heading=h.3'
    expect(refreshedTaskUrl(locked, url)).toBe(url)
    const page = { ...locked, url: 'https://example.com/essay' }
    expect(refreshedTaskUrl(page, 'https://example.com/essay?view=outline#paragraph2')).toBe('https://example.com/essay?view=outline#paragraph2')
  })
  it('rejects another document, host, path, or a non-web scheme', () => {
    for (const url of ['https://docs.google.com/document/d/abcd/edit', 'https://evil.test/document/d/abc/edit',
      'https://docs.google.com.evil.test/document/d/abc/edit', 'file:///essay', 'javascript:alert(1)', 'invalid']) {
      expect(refreshedTaskUrl(locked, url)).toBeUndefined()
    }
    expect(refreshedTaskUrl({ ...locked, url: 'https://example.com/essay' }, 'https://example.com/essay2')).toBeUndefined()
  })
  it('loads old allow-list files and round-trips a single validated checkpoint', () => {
    expect(StoredStateSchema.parse({ version: 1, allowList: [] }).lockedTask).toBeUndefined()
    const checkpoint = savedTaskTab(locked, 10_000)
    expect(StoredStateSchema.parse(JSON.parse(JSON.stringify({ version: 1, allowList: [], lockedTask: checkpoint }))).lockedTask)
      .toEqual({ app: 'Safari', bundleId: 'com.apple.Safari', title: 'Essay', url: locked.url, savedAt: 10_000 })
    expect(() => StoredStateSchema.parse({ version: 1, allowList: [], lockedTask: { ...checkpoint, url: 'file:///essay' } })).toThrow()
    expect(SavedTaskTabSchema.safeParse({ ...checkpoint, url: 'invalid' }).success).toBe(false)
    expect(savedTaskTab({ ...locked, app: 'TextEdit', bundleId: 'com.apple.TextEdit', url: undefined }, 1)).toBeUndefined()
  })
})
