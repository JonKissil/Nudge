import { z } from 'zod'
import { DEFAULTS, DEMO } from './config'

export const GRACE_HISTORY_LIMIT = 20
export const GraceReturnSchema = z.number().int().min(5_000).max(600_000)
export const GraceHistorySchema = z.array(GraceReturnSchema).max(GRACE_HISTORY_LIMIT)

/** Allow most recent unprompted returns to finish, with another 15 seconds of breathing room. */
export function adaptiveGraceMs(history: readonly number[], enabled = true, demoMode = false): number {
  if (demoMode) return DEMO.graceMs
  const samples = history.filter((value) => GraceReturnSchema.safeParse(value).success).slice(-GRACE_HISTORY_LIMIT)
  if (!enabled || samples.length < 5) return DEFAULTS.graceMs
  const sorted = [...samples].sort((a, b) => a - b)
  const typicalReturn = sorted[Math.ceil(sorted.length * 0.75) - 1]!
  return Math.max(45_000, Math.min(180_000, Math.ceil((typicalReturn + 15_000) / 5_000) * 5_000))
}
