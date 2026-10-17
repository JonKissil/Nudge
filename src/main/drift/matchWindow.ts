import type { AllowListEntry, WindowInfo } from '../../shared/types'

export function isBrowser(window: WindowInfo): boolean {
  return /(?:chrome|safari|arc|firefox|brave|edge|vivaldi|opera)/iu.test(`${window.app} ${window.bundleId}`)
}

function webUrl(value: string | undefined): URL | undefined {
  try {
    const url = new URL(value ?? '')
    return ['http:', 'https:'].includes(url.protocol) ? url : undefined
  } catch { return undefined }
}

export function matchWindow(current: WindowInfo, locked: WindowInfo): boolean {
  if (isBrowser(current) || isBrowser(locked)) {
    if (!isBrowser(current) || !isBrowser(locked)) return false
    const a = webUrl(current.url), b = webUrl(locked.url)
    if (!a || !b) return false
    if (a.hostname === 'docs.google.com' && b.hostname === 'docs.google.com') {
      const aId = a.pathname.match(/^\/document\/d\/([^/]+)/u)?.[1]
      const bId = b.pathname.match(/^\/document\/d\/([^/]+)/u)?.[1]
      if (aId || bId) return Boolean(aId && aId === bId)
    }
    return a.origin === b.origin && a.pathname === b.pathname
  }
  const prefix = locked.title.trim().slice(0, 20).toLocaleLowerCase()
  return Boolean(locked.bundleId && current.bundleId === locked.bundleId && prefix
    && current.title.toLocaleLowerCase().includes(prefix))
}

export function matchesAllowList(window: WindowInfo, entries: readonly AllowListEntry[]): boolean {
  return entries.some((entry) => {
    if (entry.kind === 'bundle') return Boolean(window.bundleId && window.bundleId === entry.value)
    const current = webUrl(window.url), prefix = webUrl(entry.value)
    return Boolean(current && prefix && current.origin === prefix.origin && current.href.startsWith(prefix.href))
  })
}
