import { describe, expect, it } from 'vitest'
import { addAllowedWindow, allowListEntry, StoredStateSchema } from '../src/main/drift/allowList'
import { classifyWindow } from '../src/main/drift/rules'
import { matchesAllowList } from '../src/main/drift/matchWindow'
import type { WindowInfo } from '../src/shared/types'

const video: WindowInfo = { app: 'Safari', bundleId: 'com.apple.Safari', title: 'Lecture',
  url: 'https://youtube.com/watch?v=123#chapter', bounds: { x: 0, y: 0, width: 1280, height: 800 } }
describe('saved allow-list', () => {
  it('round-trips a video through JSON, deduplicates, and allows only that video', () => {
    const state = addAllowedWindow({ version: 1, allowList: [] }, video)
    const loaded = StoredStateSchema.parse(JSON.parse(JSON.stringify(state)))
    expect(addAllowedWindow(state, video)).toBe(state)
    expect(classifyWindow(video, undefined, loaded.allowList, { ownProcessId: 9999 })).toBe('on')
    expect(matchesAllowList({ ...video, url: 'https://youtube.com/watch?v=123&t=10' }, loaded.allowList)).toBe(true)
    expect(matchesAllowList({ ...video, url: 'https://youtube.com/watch?v=1234' }, loaded.allowList)).toBe(false)
    expect(matchesAllowList({ ...video, url: 'https://youtube.com/watch?v=999' }, loaded.allowList)).toBe(false)
    expect(matchesAllowList({ ...video, url: 'https://youtube.com.evil.test/watch?v=123' }, loaded.allowList)).toBe(false)
  })
  it('saves other apps by bundle and refuses broad browser allowances without a URL', () => {
    expect(allowListEntry({ ...video, app: 'TextEdit', bundleId: 'com.apple.TextEdit', url: undefined }))
      .toEqual({ kind: 'bundle', value: 'com.apple.TextEdit' })
    expect(() => allowListEntry({ ...video, url: undefined })).toThrow()
    expect(() => allowListEntry({ ...video, url: 'file:///notes' })).toThrow()
    expect(() => StoredStateSchema.parse({ version: 9, allowList: [] })).toThrow()
    expect(() => StoredStateSchema.parse({ version: 1, allowList: [{ kind: 'bundle', value: '' }] })).toThrow()
  })
})
