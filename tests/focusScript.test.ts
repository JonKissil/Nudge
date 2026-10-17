import { describe, expect, it } from 'vitest'
import { appleScriptString, buildFocusScript, buildReadTaskUrlScript } from '../src/main/os/focusScript'
import type { WindowInfo } from '../src/shared/types'

const safari: WindowInfo = { app: 'Safari', bundleId: 'com.apple.Safari', title: 'Essay',
  url: 'https://docs.google.com/document/d/abc/edit?tab=1', bounds: { x: 0, y: 0, width: 1400, height: 900 } }

describe('focus AppleScript', () => {
  it('quotes backslashes and double quotes without allowing control characters', () => {
    expect(appleScriptString('Essay \\ "draft"')).toBe('"Essay \\\\ \\"draft\\""')
    for (const text of ['a\nactivate', 'a\rreturn', 'a\u0000']) expect(() => appleScriptString(text)).toThrow()
  })
  it('selects Safari tabs and matches a complete Google Docs ID', () => {
    const script = buildFocusScript(safari)
    expect(script).toContain('tell application id "com.apple.Safari"')
    expect(script).toContain('set current tab of w to t')
    expect(script).toContain('set target to "https://docs.google.com/document/d/abc"')
    expect(script).toContain('set boundary to character')
    expect(script).toContain('considering case')
    expect(script).toContain('or boundary is "/"')
    expect(script).toContain('make new document with properties {URL:"https://docs.google.com/document/d/abc/edit?tab=1"}')
    expect(script).toContain('make new tab at end of tabs of w')
  })
  it('selects a Chromium tab and uses origin/path rather than search or fragment', () => {
    const script = buildFocusScript({ ...safari, app: 'Google Chrome', bundleId: 'com.google.Chrome', url: 'https://example.com/essay?q=a#part' })
    expect(script).toContain('set active tab index of w to tabNumber')
    expect(script).toContain('set target to "https://example.com/essay"')
    expect(script).not.toContain('or boundary is "/"')
    expect(script).toContain('set URL of active tab of w to "https://example.com/essay?q=a#part"')
  })
  it('reads a matching background tab without selecting, activating, or creating anything', () => {
    for (const window of [safari, { ...safari, app: 'Google Chrome', bundleId: 'com.google.Chrome' }]) {
      const script = buildReadTaskUrlScript(window)
      expect(script).toContain('is not running then return ""')
      expect(script).toContain('return URL of t')
      expect(script).not.toMatch(/activate|make new|set current tab|set active tab index/u)
    }
    expect(buildReadTaskUrlScript({ ...safari, app: 'TextEdit', bundleId: 'com.apple.TextEdit' })).toBeUndefined()
  })
  it('activates other apps safely and declines unsupported browser tab automation', () => {
    expect(buildFocusScript({ ...safari, app: 'TextEdit', bundleId: 'com.apple.TextEdit', url: undefined }))
      .toBe('tell application id "com.apple.TextEdit" to activate\nreturn "ok"')
    expect(buildFocusScript({ ...safari, app: 'Firefox', bundleId: 'org.mozilla.firefox' })).toBeUndefined()
    expect(buildFocusScript({ ...safari, url: undefined })).toBeUndefined()
    expect(buildFocusScript({ ...safari, url: 'file:///essay' })).toBeUndefined()
  })
})
