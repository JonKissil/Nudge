import type { ConnState, RuleVerdict } from '../../shared/types'

/** Unknown windows stay on task when model judgment is unavailable. */
export function effectiveVerdict(verdict: RuleVerdict, connection: ConnState): RuleVerdict {
  return connection === 'degraded' && verdict === 'ask' ? 'on' : verdict
}
