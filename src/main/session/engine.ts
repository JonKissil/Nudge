import type { ActionResult } from '../../shared/types'
import type { ToolHandlers } from '../gemini/tools'
import { executeEffect, type EffectPorts } from './effects'
import { createStudyState, reduce, type StudyConfig, type StudyEvent, type StudyState } from './stateMachine'

export class StudyEngine {
  state: StudyState
  private reentryVersion = 0

  constructor(
    config: StudyConfig,
    private readonly ports: EffectPorts,
    private readonly onState: (state: StudyState, previous: StudyState, event: StudyEvent) => void = () => {},
    private readonly clock: () => number = Date.now,
  ) {
    this.state = createStudyState(config)
  }

  async dispatch(event: StudyEvent, now = this.clock()): Promise<ActionResult> {
    // Save first: a failed write must leave the check-in intact, and an in-flight write
    // must never roll back a later Pause/End or briefly resume drift detection.
    if (event.type === 'ALLOW_CURRENT' && this.state.phase === 'CHECKIN') {
      const outcome = await executeEffect({ type: 'ALLOW_WINDOW' }, this.state, this.ports)
      if (!outcome.ok) return outcome
      if (this.state.phase !== 'CHECKIN') return { ok: true }
    }
    const previous = this.state
    const result = reduce(previous, event, now)
    if ((previous.phase !== 'REENTRY' && result.state.phase === 'REENTRY') || event.type === 'START_SETUP') this.reentryVersion++
    const reentryVersion = this.reentryVersion
    this.state = result.state
    if (this.state !== previous) this.onState(this.state, previous, event)

    for (const effect of result.effects) {
      if (event.type === 'LOCK_WINDOW' && (reentryVersion !== this.reentryVersion
        || ['IDLE', 'SETUP', 'PAUSED', 'ENDED'].includes(this.state.phase))) {
        return { ok: false, error: 'Study session start was cancelled.' }
      }
      if (event.type === 'ALLOW_CURRENT' && effect.type === 'ALLOW_WINDOW') continue
      const outcome = await executeEffect(effect, this.state, this.ports)
      if (!outcome.ok) {
        if ((event.type === 'ALLOW_CURRENT' || event.type === 'PIN_STEP') && this.state === result.state) {
          const failed = this.state
          this.state = previous
          this.onState(this.state, failed, event)
        } else if (event.type === 'RETURN_REQUEST' || event.type === 'RETURN_FAILED') {
          await this.dispatch({ type: 'RETURN_FAILED' }, now)
        }
        return outcome
      }
      if (outcome.ocrLines && this.state.phase === 'REENTRY' && this.reentryVersion === reentryVersion) {
        await this.dispatch({ type: 'REENTRY_LINES', lines: outcome.ocrLines }, now)
      }
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
    reportStatus: ({ check_id, ...status }) => engine.state.checkPending && engine.state.checkId === check_id
      ? engine.dispatch({ type: 'MODEL_STATUS', status, checkId: check_id })
      : Promise.resolve({ ok: false, error: 'This screen check is no longer current.' }),
    reportStatusFailed: async (checkId) => { await engine.dispatch({ type: 'CHECK_FAILED', checkId }) },
    focusTaskWindow: () => engine.state.phase === 'CHECKIN'
      || (engine.state.phase === 'RETURNING' && engine.state.returnMode === 'guided')
      ? engine.dispatch({ type: 'RETURN_REQUEST', mode: 'focused' })
      : Promise.resolve({ ok: false, error: 'A return is already running or no check-in is open.' }),
    guideToTask: () => only('CHECKIN', { type: 'RETURN_REQUEST', mode: 'guided' }),
    pinNextStep: ({ text, line_id }) => only('REENTRY', { type: 'PIN_STEP', text, lineId: line_id }),
    snooze: ({ minutes }) => only('CHECKIN', { type: 'SNOOZE', minutes }),
    allowCurrentWindow: () => only('CHECKIN', { type: 'ALLOW_CURRENT' }),
    endCheckin: () => only('CHECKIN', { type: 'END_CHECKIN' }),
    setTask: ({ task, minutes }) => only('SETUP', { type: 'START_SETUP', task, minutes }),
  }
}
