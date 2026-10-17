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
  it('keeps status reports silent and validates their arguments', async () => {
    const valid = await runToolCall({ id: '1', name: 'report_status', args: {
      on_task: false, activity: 'Watching a video', confidence: 0.9,
    } }, handlers)
    expect(valid).toEqual({ id: '1', name: 'report_status', response: { ok: true }, scheduling: 'silent' })
    const invalid = await runToolCall({ id: '2', name: 'report_status', args: {
      on_task: false, activity: 'Watching a video', confidence: 3,
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
