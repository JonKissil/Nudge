import { z } from 'zod'
import { adaptiveGraceMs } from './grace'

export const HABIT_HISTORY_LIMIT = 60
const grace = z.number().int().min(45_000).max(180_000)
const duration = z.number().int().min(0).max(3_600_000)
const base = { id: z.uuid(), graceMs: grace }
export const TimingFeedbackSchema = z.strictObject({ preference: z.enum(['more-time', 'sooner']) })
export type TimingFeedback = z.infer<typeof TimingFeedbackSchema>
export const HabitEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...base, kind: z.literal('spontaneous-return'), durationMs: duration.min(5_000) }),
  z.strictObject({ ...base, kind: z.literal('nudge'), durationMs: duration }),
  z.strictObject({ ...base, kind: z.literal('independent-return'), durationMs: duration, nudgedAfterMs: duration }),
  z.strictObject({ ...base, kind: z.literal('assisted-return'), durationMs: duration, nudgedAfterMs: duration }),
  z.strictObject({ ...base, kind: z.literal('snooze'), minutes: z.number().int().min(1).max(30) }),
  z.strictObject({ ...base, kind: z.literal('feedback-more-time') }),
  z.strictObject({ ...base, kind: z.literal('feedback-sooner') }),
])
export type HabitEvent = z.infer<typeof HabitEventSchema>
export const HabitReasonSchema = z.enum(['return-pattern', 'requested-more-time', 'requested-sooner', 'mixed-history'])
export const HabitProposalSchema = z.strictObject({
  review_id: z.uuid(), grace_ms: grace,
  evidence_ids: z.array(z.uuid()).min(5).max(20), reason: HabitReasonSchema,
})
export type HabitProposal = z.infer<typeof HabitProposalSchema>
export const HabitProfileSchema = z.strictObject({
  graceMs: grace, reason: HabitReasonSchema, evidenceIds: z.array(z.uuid()).min(5).max(20),
  reviewedRevision: z.number().int().nonnegative(),
})
export type HabitProfile = z.infer<typeof HabitProfileSchema>
export const HabitMemorySchema = z.strictObject({
  revision: z.number().int().nonnegative(), events: z.array(HabitEventSchema).max(HABIT_HISTORY_LIMIT),
  profile: HabitProfileSchema.optional(),
})
export type HabitMemory = z.infer<typeof HabitMemorySchema>
export const emptyHabitMemory = (): HabitMemory => ({ revision: 0, events: [] })

export function addHabitEvent(memory: HabitMemory, event: HabitEvent): HabitMemory {
  // One episode occupies one record: a confirmed return replaces its earlier nudge.
  return { ...memory, revision: memory.revision + 1,
    events: [...memory.events.filter((previous) => previous.id !== event.id), event].slice(-HABIT_HISTORY_LIMIT) }
}

/** Evidence and limits are checked locally; model confidence cannot bypass them. */
export function validateHabitProposal(
  proposal: HabitProposal, memory: HabitMemory, currentGraceMs: number,
): HabitProfile | undefined {
  const ids = new Set(proposal.evidence_ids)
  if (ids.size !== proposal.evidence_ids.length) return
  const evidence = memory.events.filter((event) => ids.has(event.id))
  if (evidence.length !== ids.size) return
  const returns = evidence.filter((event) => event.kind === 'spontaneous-return')
  const later = evidence.some((event) => event.kind === 'feedback-more-time')
  const sooner = evidence.some((event) => event.kind === 'feedback-sooner')
  if (later && !sooner && proposal.grace_ms < currentGraceMs) return
  if (sooner && !later && proposal.grace_ms > currentGraceMs) return
  if (proposal.reason === 'requested-more-time' && (!later || proposal.grace_ms < currentGraceMs)) return
  if (proposal.reason === 'requested-sooner' && (!sooner || proposal.grace_ms > currentGraceMs)) return
  if (proposal.reason === 'return-pattern' || (!later && !sooner)) {
    if (returns.length < 5) return
    const baseline = adaptiveGraceMs(returns.map((event) => event.durationMs))
    if (Math.abs(proposal.grace_ms - baseline) > 15_000) return
  }
  const rounded = Math.ceil(proposal.grace_ms / 5_000) * 5_000
  return { graceMs: Math.max(45_000, Math.min(180_000, currentGraceMs + 15_000,
    Math.max(currentGraceMs - 15_000, rounded))),
  reason: proposal.reason, evidenceIds: [...ids], reviewedRevision: memory.revision }
}

export const HABIT_EXPLANATIONS: Record<HabitProfile['reason'], string> = {
  'return-pattern': 'Based on your recent unprompted returns.',
  'requested-more-time': 'Adjusted toward your request for more time.',
  'requested-sooner': 'Adjusted toward your request for earlier check-ins.',
  'mixed-history': 'Based on your recent timing history.',
}

export function selectHabitGraceMs(history: readonly number[], adaptive: boolean, demo: boolean,
  gemini: boolean, profile?: HabitProfile): number {
  const baseline = adaptiveGraceMs(history, adaptive, demo)
  return adaptive && !demo && gemini && profile ? profile.graceMs : baseline
}
