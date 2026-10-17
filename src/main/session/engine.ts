import type { ActionResult } from '../../shared/types'
import type { ToolHandlers } from '../gemini/tools'
import { executeEffect, type EffectPorts } from './effects'
import { createStudyState, reduce, type StudyConfig, type StudyEvent, type StudyState } from './stateMachine'

export class StudyEngine {
  state: StudyState

  constructor(
    config: StudyConfig,
    private readonly ports: EffectPorts,
    private readonly onState: (state: StudyState, previous: StudyState) => void = () => {},
    private readonly clock: () => number = Date.now,
  ) {
    this.state = createStudyState(config)
  }

  async dispatch(event: StudyEvent, now = this.clock()): Promise<ActionResult> {
    const previous = this.state
    const result = reduce(previous, event, now)
    this.state = result.state
    if (this.state !== previous) this.onState(this.state, previous)

    for (const effect of result.effects) {
      const outcome = await executeEffect(effect, this.state, this.ports)
      if (!outcome.ok) {
        if (event.type === 'ALLOW_CURRENT' || event.type === 'PIN_STEP') {
          const failed = this.state
          this.state = previous
          this.onState(this.state, failed)
        } else if (event.type === 'RETURN_REQUEST' || event.type === 'RETURN_FAILED') {
          await this.dispatch({ type: 'RETURN_FAILED' }, now)
        }
        return outcome
      }
      if (outcome.ocrLines) await this.dispatch({ type: 'REENTRY_LINES', lines: outcome.ocrLines }, now)
    }

    if (event.type === 'TICK' && result.state.phase === 'NUDGING') {
      await this.dispatch({ type: 'NUDGE_SENT' }, now)
    }
    return { ok: true }
  }
}

/** Gemini tools and overlay buttons both use this engine; invalid phases never claim success. */
export function createStudyToolHandlers(engine: StudyEngine): ToolHandlers {
  const only = (phase: StudyState['phase'], event: StudyEvent): Promise<ActionResult> =>
    engine.state.phase === phase
      ? engine.dispatch(event)
      : Promise.resolve({ ok: false, error: `This action is only available during ${phase.toLowerCase()}.` })

  return {
    reportStatus: (status) => engine.state.checkPending
      ? engine.dispatch({ type: 'MODEL_STATUS', status })
      : Promise.resolve({ ok: false, error: 'No screen check is pending.' }),
    focusTaskWindow: () => only('CHECKIN', { type: 'RETURN_REQUEST', mode: 'focused' }),
    guideToTask: () => only('CHECKIN', { type: 'RETURN_REQUEST', mode: 'guided' }),
    pinNextStep: ({ text, line_id }) => only('REENTRY', { type: 'PIN_STEP', text, lineId: line_id }),
    snooze: ({ minutes }) => only('CHECKIN', { type: 'SNOOZE', minutes }),
    allowCurrentWindow: () => only('CHECKIN', { type: 'ALLOW_CURRENT' }),
    endCheckin: () => only('CHECKIN', { type: 'END_CHECKIN' }),
    setTask: ({ task, minutes }) => only('SETUP', { type: 'START_SETUP', task, minutes }),
  }
}
