import type { PermissionStatus, SessionSnapshot } from '../../shared/types'

export function permissionView(
  kind: keyof PermissionStatus, status: PermissionStatus | undefined,
  snapshot?: SessionSnapshot,
): { label: string; needsAttention: boolean } {
  if (kind === 'screen' && snapshot?.stats.capture?.state === 'running') {
    return { label: 'Capture working', needsAttention: false }
  }
  if (kind === 'accessibility' && snapshot?.stats.currentWindow?.url) {
    // Successful browser reads demonstrate useful access, not the AX trust flag itself.
    return { label: 'Browser details working', needsAttention: false }
  }
  const value = status?.[kind]
  if (!value) return { label: 'Checking…', needsAttention: false }
  if (value === 'granted') return { label: 'Allowed', needsAttention: false }
  if (value === 'denied' || value === 'not-trusted') {
    return { label: 'Not active for this launch', needsAttention: true }
  }
  if (value === 'restricted') return { label: 'Restricted by macOS', needsAttention: true }
  if (value === 'not-determined') return { label: 'Not requested yet', needsAttention: true }
  return { label: 'Not verified', needsAttention: true }
}
