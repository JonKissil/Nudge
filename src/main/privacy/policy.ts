import { isBrowser, matchWindow } from '../drift/matchWindow'
import type { WindowInfo } from '../../shared/types'
import type { PrivacySettings, PrivacyState } from '../../shared/privacy'

function appMatches(entries: readonly string[], window: WindowInfo): boolean {
  return entries.some((entry) => [window.app, window.bundleId].some((value) => value.toLowerCase() === entry.toLowerCase()))
}
export function domainMatches(entries: readonly string[], hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/u, '')
  return entries.some((entry) => host === entry || host.endsWith(`.${entry}`))
}
export function sharingDecision(window: WindowInfo | undefined, task: WindowInfo | undefined,
  settings: PrivacySettings, ownProcessId?: number): PrivacyState['reason'] {
  if (!window || !window.id || (ownProcessId !== undefined && window.ownerPid === ownProcessId)) return 'unknown'
  if (appMatches(settings.excludedApps, window)) return 'excluded-app'
  let host = ''
  if (isBrowser(window)) {
    try {
      const url = new URL(window.url ?? '')
      if (!['http:', 'https:'].includes(url.protocol)) return 'unknown'
      host = url.hostname
    } catch { return 'unknown' }
    if (domainMatches(settings.excludedDomains, host)) return 'excluded-site'
    if (!settings.shareBrowserContent) return 'browser-disabled'
  }
  const approved = (task && matchWindow(window, task)) || appMatches(settings.approvedApps, window)
    || (host && domainMatches(settings.approvedDomains, host))
  return settings.approvedOnly && !approved ? 'unapproved' : 'sharing'
}

/** Defensive text minimization, not a general detector for all private information. */
export function sanitizeText(text: string): string {
  return text
    .replace(/https?:\/\/[^\s<>"']+/giu, (value) => {
      try { return new URL(value).origin } catch { return '[URL withheld]' }
    })
    .replace(/\b(?:password|passwd|api[_ -]?key|access[_ -]?token|secret|authorization)\s*[:=]\s*(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)/giu, '[credential withheld]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, '[email withheld]')
    .replace(/\b(?:AIza[\w-]{20,}|sk-[\w-]{20,}|ghp_[\w]{20,}|github_pat_[\w]{20,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/gu, '[token withheld]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/gu, '[identifier withheld]')
    .replace(/\b(?:\d[ -]?){12,18}\d\b/gu, '[number withheld]')
}
export function sanitizeWindow(window: WindowInfo): WindowInfo {
  let url: string | undefined
  try {
    const parsed = window.url && new URL(window.url)
    if (parsed && ['http:', 'https:'].includes(parsed.protocol)) url = parsed.origin
  } catch { /* omit malformed URLs */ }
  return { ...window, title: '[Window title withheld]', url }
}
