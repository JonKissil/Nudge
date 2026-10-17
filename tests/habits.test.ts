import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  addHabitEvent, emptyHabitMemory, HabitEventSchema, HabitProposalSchema, selectHabitGraceMs,
  validateHabitProposal, type HabitMemory, type HabitProposal,
} from '../src/shared/habits'

function fixture(): { memory: HabitMemory; proposal: HabitProposal } {
  let memory = emptyHabitMemory()
  for (let i = 0; i < 5; i++) memory = addHabitEvent(memory, {
    id: randomUUID(), kind: 'spontaneous-return', durationMs: 60_000, graceMs: 90_000,
  })
  return { memory, proposal: { review_id: randomUUID(), grace_ms: 75_000,
    evidence_ids: memory.events.map((event) => event.id), reason: 'return-pattern' } }
}

describe('habit recommendation policy', () => {
  it('requires real distinct evidence and keeps changes within 15 seconds', () => {
    const { memory, proposal } = fixture()
    expect(validateHabitProposal(proposal, memory, 120_000)?.graceMs).toBe(105_000)
    expect(validateHabitProposal({ ...proposal, evidence_ids: Array(5).fill(memory.events[0]!.id) }, memory, 90_000)).toBeUndefined()
    expect(validateHabitProposal({ ...proposal, evidence_ids: [...proposal.evidence_ids.slice(1), randomUUID()] }, memory, 90_000)).toBeUndefined()
    expect(HabitProposalSchema.safeParse({ ...proposal, grace_ms: 999_999 }).success).toBe(false)
    expect(HabitProposalSchema.safeParse({ ...proposal, evidence_ids: [] }).success).toBe(false)
  })
  it('does not interpret nudged episodes as unprompted returns or invent feedback', () => {
    const { memory, proposal } = fixture()
    const nudges: HabitMemory = { ...memory, events: memory.events.map((event) => ({
      id: event.id, kind: 'nudge', graceMs: 90_000, durationMs: 90_000,
    })) }
    expect(validateHabitProposal(proposal, nudges, 90_000)).toBeUndefined()
    expect(validateHabitProposal({ ...proposal, reason: 'requested-sooner' }, memory, 90_000)).toBeUndefined()
    expect(validateHabitProposal({ ...proposal, grace_ms: 180_000 }, memory, 90_000)).toBeUndefined()
  })
  it('uses explicit feedback while preserving range, rounding, fallback, opt-out, and demo timing', () => {
    const { memory, proposal } = fixture()
    const last = memory.events[4]!
    memory.events[4] = { id: last.id, graceMs: 90_000, kind: 'feedback-more-time' }
    const profile = validateHabitProposal({ ...proposal, reason: 'requested-more-time', grace_ms: 107_000 }, memory, 90_000)!
    expect(profile.graceMs).toBe(105_000)
    expect(selectHabitGraceMs([], true, false, true, profile)).toBe(105_000)
    expect(selectHabitGraceMs([], false, false, true, profile)).toBe(90_000)
    expect(selectHabitGraceMs([], true, false, false, profile)).toBe(90_000)
    expect(selectHabitGraceMs([], true, true, true, profile)).toBe(15_000)
    expect(validateHabitProposal({ ...proposal, reason: 'requested-more-time', grace_ms: 60_000 }, memory, 90_000)).toBeUndefined()
  })
  it('replaces each nudge with its observed outcome and bounds metadata-only history', () => {
    let memory = emptyHabitMemory()
    const id = randomUUID()
    memory = addHabitEvent(memory, { id, kind: 'nudge', graceMs: 90_000, durationMs: 90_000 })
    memory = addHabitEvent(memory, { id, kind: 'assisted-return', graceMs: 90_000, durationMs: 110_000, nudgedAfterMs: 90_000 })
    expect(memory.events).toHaveLength(1)
    expect(memory.events[0]?.kind).toBe('assisted-return')
    for (let i = 0; i < 65; i++) memory = addHabitEvent(memory, { id: randomUUID(), kind: 'feedback-sooner', graceMs: 90_000 })
    expect(memory.events).toHaveLength(60)
    expect(memory.revision).toBe(67)
    expect(HabitEventSchema.safeParse({ ...memory.events[0], title: 'Private title' }).success).toBe(false)
  })
})
