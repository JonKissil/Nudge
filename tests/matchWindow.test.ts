import { describe, expect, it } from 'vitest'
import { isBrowser, matchesAllowList, matchWindow } from '../src/main/drift/matchWindow'
import type { WindowInfo } from '../src/shared/types'

const browser = (url?: string): WindowInfo => ({ app: 'Safari', bundleId: 'com.apple.Safari', title: 'Essay', url,
  bounds: { x: 0, y: 0, width: 100, height: 100 } })

describe('task window matching', () => {
  it('matches Google Docs ids despite edit/view paths and query parameters', () => {
    expect(matchWindow(browser('https://docs.google.com/document/d/abc/edit?tab=1'), browser('https://docs.google.com/document/d/abc/preview'))).toBe(true)
    expect(matchWindow(browser('https://docs.google.com/document/d/abcd/edit'), browser('https://docs.google.com/document/d/abc/edit'))).toBe(false)
    expect(matchWindow(browser('https://evil.test/document/d/abc/edit'), browser('https://docs.google.com/document/d/abc/edit'))).toBe(false)
  })
  it('matches other browser pages on origin and path only', () => {
    expect(matchWindow(browser('https://example.com/research?q=a#heading'), browser('https://example.com/research?q=b'))).toBe(true)
    expect(matchWindow(browser('https://example.com/other'), browser('https://example.com/research'))).toBe(false)
    expect(matchWindow(browser('https://example.com.evil.test/research'), browser('https://example.com/research'))).toBe(false)
  })
  it('does not guess a browser match from identical titles or missing/invalid URLs', () => {
    for (const url of [undefined, '', 'invalid', 'file:///essay']) expect(matchWindow(browser(url), browser(url))).toBe(false)
    expect(isBrowser({ ...browser(), app: 'Arc', bundleId: 'company.thebrowser.Browser' })).toBe(true)
  })
  it('matches non-browser windows by bundle and the first 20 title characters', () => {
    const locked = { ...browser(), app: 'TextEdit', bundleId: 'com.apple.TextEdit', title: 'My French Revolution essay' }
    expect(matchWindow({ ...locked, title: 'Edited — MY FRENCH REVOLUTION ESSAY' }, locked)).toBe(true)
    expect(matchWindow({ ...locked, bundleId: 'other' }, locked)).toBe(false)
    expect(matchWindow({ ...locked, title: 'Other essay' }, locked)).toBe(false)
    expect(matchWindow({ ...locked, title: '' }, { ...locked, title: '' })).toBe(false)
    expect(matchWindow(browser('https://example.com'), locked)).toBe(false)
  })
  it('allows URL prefixes without allowing host lookalikes, plus exact bundles', () => {
    const entries = [{ kind: 'url-prefix', value: 'https://example.com/research' }] as const
    expect(matchesAllowList(browser('https://example.com/research/sources'), entries)).toBe(true)
    expect(matchesAllowList(browser('https://example.com.evil.test/research'), entries)).toBe(false)
    expect(matchesAllowList(browser('https://example.com/other'), entries)).toBe(false)
    expect(matchesAllowList(browser('https://example.com/researchers'), entries)).toBe(false)
    expect(matchesAllowList(browser(), entries)).toBe(false)
    expect(matchesAllowList(browser(), [{ kind: 'bundle', value: 'com.apple.Safari' }])).toBe(true)
  })
})
