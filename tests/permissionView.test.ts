import { describe, expect, it } from 'vitest'
import { permissionView } from '../src/renderer/control/permissionView'
import type { PermissionStatus, SessionSnapshot } from '../src/shared/types'
import { PermissionStatusSchema } from '../src/shared/types'

const status: PermissionStatus = { screen: 'denied', microphone: 'granted', accessibility: 'not-trusted' }
const snapshot: SessionSnapshot = {
  state: 'FOCUSED', conn: 'connected', task: 'Essay', minutes: 30, language: 'en',
  settings: { demoMode: false, showHud: false, theme: 'minimalist', quietMode: false },
  stats: { framesPerMinute: 0, resumptionHandleAgeMs: null, transitions: [], logs: [], capture: { state: 'off' } },
}

describe('permission presentation', () => {
  it('distinguishes an untrusted process from an explicit denial', () => {
    expect(PermissionStatusSchema.parse(status).accessibility).toBe('not-trusted')
    expect(permissionView('accessibility', status)).toEqual({ label: 'Not active for this launch', needsAttention: true })
    expect(permissionView('screen', status)).toEqual({ label: 'Not active for this launch', needsAttention: true })
  })

  it('reports working capture despite a conflicting system flag without claiming a grant', () => {
    const running = { ...snapshot, stats: { ...snapshot.stats, capture: { state: 'running' as const } } }
    expect(permissionView('screen', status, running)).toEqual({ label: 'Capture working', needsAttention: false })
    expect(permissionView('screen', status, snapshot).needsAttention).toBe(true)
  })

  it('recognizes successful Safari URL reads as browser access, not an Accessibility grant', () => {
    const readable = { ...snapshot, stats: { ...snapshot.stats, currentWindow: {
      app: 'Safari', bundleId: 'com.apple.Safari', title: 'Essay', url: 'https://example.com/essay',
      bounds: { x: 0, y: 0, width: 100, height: 100 },
    } } }
    expect(permissionView('accessibility', status, readable)).toEqual({ label: 'Browser details working', needsAttention: false })
    const withoutUrl = { ...readable, stats: { ...readable.stats,
      currentWindow: { ...readable.stats.currentWindow, url: undefined } } }
    expect(permissionView('accessibility', status, withoutUrl).needsAttention).toBe(true)
  })

  it('keeps restricted, unrequested, unknown, and pending states distinct', () => {
    expect(permissionView('screen', undefined).label).toBe('Checking…')
    expect(permissionView('microphone', status)).toEqual({ label: 'Allowed', needsAttention: false })
    expect(permissionView('screen', { ...status, screen: 'restricted' }).label).toBe('Restricted by macOS')
    expect(permissionView('screen', { ...status, screen: 'not-determined' }).label).toBe('Not requested yet')
    expect(permissionView('screen', { ...status, screen: 'unknown' }).label).toBe('Not verified')
  })
})
