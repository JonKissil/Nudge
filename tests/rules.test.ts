import { describe, expect, it } from 'vitest'
import { classifyWindow } from '../src/main/drift/rules'
import type { WindowInfo } from '../src/shared/types'

const window = (url?: string): WindowInfo => ({ app: 'Safari', bundleId: 'com.apple.Safari', title: 'Essay', url,
  ownerPid: 123, bounds: { x: 0, y: 0, width: 100, height: 100 } })
const config = { ownProcessId: 999 }

describe('deterministic drift rules', () => {
  it('ignores our windows before all other rules', () => {
    const own = { ...window('https://reddit.com'), ownerPid: 999 }
    expect(classifyWindow(own, own, [], config)).toBe('ignore')
    expect(classifyWindow({ ...own, ownerPid: 888 }, undefined, [], config)).toBe('off')
  })
  it('allows task windows and allow-list entries before the hard blocklist', () => {
    const task = window('https://reddit.com/r/history')
    expect(classifyWindow(task, task, [], config)).toBe('on')
    expect(classifyWindow(task, undefined, [{ kind: 'url-prefix', value: 'https://reddit.com/r/history' }], config)).toBe('on')
  })
  it.each(['https://reddit.com', 'https://old.reddit.com/r/a', 'https://x.com', 'https://tiktok.com', 'https://instagram.com', 'https://netflix.com'])('marks known distracting domains off: %s', (url) => {
    expect(classifyWindow(window(url), undefined, [], config)).toBe('off')
  })
  it.each(['https://youtube.com/watch?v=lecture', 'https://reddit.com.evil.test', 'https://notreddit.com', 'invalid', undefined])('asks for judgment on ambiguous screens: %s', (url) => {
    expect(classifyWindow(window(url), undefined, [], config)).toBe('ask')
  })
})
