import { HARD_BLOCKLIST } from '../../shared/config'
import type { AllowListEntry, RuleVerdict, WindowInfo } from '../../shared/types'
import { matchesAllowList, matchWindow } from './matchWindow'

export interface RuleConfig { ownProcessId: number; hardBlocklist?: readonly string[] }

export function classifyWindow(current: WindowInfo, locked: WindowInfo | undefined,
  allowList: readonly AllowListEntry[], config: RuleConfig): RuleVerdict {
  if (current.ownerPid === config.ownProcessId) return 'ignore'
  if (locked && matchWindow(current, locked)) return 'on'
  if (matchesAllowList(current, allowList)) return 'on'
  try {
    const domain = new URL(current.url ?? '').hostname.toLowerCase().replace(/\.$/u, '')
    if ((config.hardBlocklist ?? HARD_BLOCKLIST).some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`))) {
      return 'off'
    }
  } catch { /* Unknown URLs need model judgment, never a guessed off-task verdict. */ }
  return 'ask'
}
