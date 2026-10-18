import { describe, expect, it } from 'vitest'
import { runToolCall, type ToolHandlers } from '../src/main/gemini/tools'

const handlers: ToolHandlers = {
  reportStatus: async () => ({ ok: true }),
  focusTaskWindow: async () => ({ ok: true }),
  guideToTask: async () => ({ ok: true }),
  pinNextStep: async () => ({ ok: true }),
  snooze: async ({ minutes }) => ({ ok: true, minutes }),
  allowCurrentWindow: async () => ({ ok: true }),
  endCheckin: async () => ({ ok: true }),
  setTask: async () => ({ ok: true }),
}

describe('Live tool boundary', () => {
  it('validates habit proposals and feedback and keeps review results silent', async () => {
    const invalid = await runToolCall({ id: 'habit-1', name: 'propose_grace_period', args: {
      review_id: 'invented', grace_ms: 999_999, evidence_ids: [], reason: 'return-pattern',
    } }, handlers)
    expect(invalid).toMatchObject({ id: 'habit-1', scheduling: 'silent', response: { ok: false } })
    const recordTimingFeedback = async ({ preference }: { preference: string }) => ({ ok: true, preference })
    expect(await runToolCall({ id: 'feedback-1', name: 'record_timing_feedback', args: { preference: 'more-time' } }, {
      ...handlers, recordTimingFeedback,
    })).toMatchObject({ response: { ok: true, preference: 'more-time' }, scheduling: 'when-idle' })
    expect(await runToolCall({ id: 'feedback-2', name: 'record_timing_feedback', args: { preference: 'made-up' } }, {
      ...handlers, recordTimingFeedback,
    })).toMatchObject({ response: { ok: false } })
  })
  it('keeps status reports silent and validates their arguments', async () => {
    const valid = await runToolCall({ id: '1', name: 'report_status', args: {
      check_id: 'check-1', on_task: false, activity: 'Watching a video', confidence: 0.9,
    } }, handlers)
    expect(valid).toEqual({ id: '1', name: 'report_status', response: { ok: true }, scheduling: 'silent' })
    const invalid = await runToolCall({ id: '2', name: 'report_status', args: {
      check_id: 'check-1', on_task: false, activity: 'Watching a video', confidence: 3,
    } }, handlers)
    expect(invalid).toMatchObject({ id: '2', response: { ok: false }, scheduling: 'silent' })
  })

  it('defaults snooze to five minutes and rejects assignment text over the limit', async () => {
    expect((await runToolCall({ id: '3', name: 'snooze', args: {} }, handlers)).response).toEqual({ ok: true, minutes: 5 })
    expect((await runToolCall({ id: '4', name: 'pin_next_step', args: {
      text: 'x'.repeat(121), line_id: 'L7',
    } }, handlers)).response).toMatchObject({ ok: false })
  })

  it('returns a response for unknown tools and handler failures', async () => {
    expect((await runToolCall({ id: '5', name: 'delete_everything', args: {} }, handlers)).response).toMatchObject({ ok: false })
    const failed = await runToolCall({ id: '6', name: 'focus_task_window', args: {} }, {
      ...handlers, focusTaskWindow: async () => { throw new Error('Failure') },
    })
    expect(failed).toEqual({
      id: '6', name: 'focus_task_window', scheduling: 'when-idle',
      response: { ok: false, error: 'The action could not be completed.' },
    })
  })
})
