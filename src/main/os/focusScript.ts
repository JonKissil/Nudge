import type { WindowInfo } from '../../shared/types'
import { isBrowser } from '../drift/matchWindow'

/** AppleScript literals cannot contain unescaped quotes, slashes, or line breaks. */
export function appleScriptString(value: string): string {
  if ([...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new Error('Unsupported control character in application or URL.')
  }
  return `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`
}

export function buildFocusScript(window: WindowInfo): string | undefined {
  const application = window.bundleId
    ? `application id ${appleScriptString(window.bundleId)}` : `application ${appleScriptString(window.app)}`
  if (!isBrowser(window)) return `tell ${application} to activate\nreturn "ok"`
  const safari = window.bundleId === 'com.apple.Safari' || window.app === 'Safari'
  const chromium = /^(com\.google\.Chrome(?:\..+)?|company\.thebrowser\.Browser|com\.brave\.Browser|com\.microsoft\.edgemac)$/u.test(window.bundleId)
  if ((!safari && !chromium) || !window.url) return undefined
  const url = new URL(window.url)
  if (!['http:', 'https:'].includes(url.protocol)) return undefined
  const documentId = url.hostname === 'docs.google.com' ? url.pathname.match(/^\/document\/d\/([^/]+)/u)?.[1] : undefined
  const target = documentId ? `${url.origin}/document/d/${documentId}` : `${url.origin}${url.pathname}`
  return `on matchesTask(candidate)
  if candidate is missing value then return false
  set candidate to candidate as text
  set target to ${appleScriptString(target)}
  considering case
    if candidate does not start with target then return false
    if (length of candidate) = (length of target) then return true
    set boundary to character ((length of target) + 1) of candidate
    return boundary is "?" or boundary is "#"${documentId ? ' or boundary is "/"' : ''}
  end considering
end matchesTask
tell ${application}
  repeat with w in windows
    set tabNumber to 0
    repeat with t in tabs of w
      set tabNumber to tabNumber + 1
      if my matchesTask(URL of t) then
        ${safari ? 'set current tab of w to t' : 'set active tab index of w to tabNumber'}
        set index of w to 1
        activate
        return "ok"
      end if
    end repeat
  end repeat
end tell
return "not_found"`
}
