import { describe, expect, it } from 'vitest'
import { LiveQueue } from '../src/main/gemini/liveQueue'
import type { LiveTurn } from '../src/main/gemini/types'

const turn = (tag: LiveTurn['tag'], text: string = tag): LiveTurn => ({ tag, text, turnComplete: true })

describe('LiveQueue', () => {
  it('keeps only the newest screen check and expires old turns', () => {
    const queue = new LiveQueue()
    queue.addTurn(turn('CHECK', 'first'), 1_000)
    queue.addTurn(turn('CHECK', 'latest'), 2_000)
    expect(queue.firstTurn(2_000)?.text).toBe('latest')
    expect(queue.firstTurn(33_001)).toBeUndefined()
  })

  it('drops old-session replies and keeps only a current return prompt after fresh restore', () => {
    const queue = new LiveQueue()
    queue.addTurn(turn('CHECK'), 1_000)
    queue.addTurn(turn('USER_RETURNED'), 1_000)
    queue.addResponse({ id: 'old', name: 'pin_next_step', response: { ok: true }, scheduling: 'when-idle' }, 1)
    queue.prepareFresh('REENTRY', 2_000)
    expect(queue.firstResponse(2)).toBeUndefined()
    expect(queue.firstTurn(2_000)?.tag).toBe('USER_RETURNED')
    queue.shiftTurn()
    expect(queue.firstTurn(2_000)).toBeUndefined()
  })

  it('caps retained work during a long outage', () => {
    const queue = new LiveQueue()
    for (let index = 0; index < 40; index++) queue.addTurn(turn('NUDGE', String(index)), 1_000)
    expect(queue.firstTurn(1_000)?.text).toBe('24')
    for (let index = 0; index < 40; index++) {
      queue.addResponse({ id: String(index), name: 'report_status', response: { ok: true }, scheduling: 'silent' }, 1)
    }
    expect(queue.firstResponse(1)?.id).toBe('8')
  })
})
