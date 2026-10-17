import type { ActionResult, WindowInfo } from '../../shared/types'
import type { LiveSessionContext, LiveTurn } from '../gemini/types'
import type { StudyEffect, StudyState } from './stateMachine'

export interface EffectPorts {
  startLive(context: LiveSessionContext): Promise<void>
  stopLive(): Promise<void>
  sendTurn(turn: LiveTurn): void
  setMicOpen(open: boolean): void
  setCheckinActive(active: boolean): void
  setCaptureRunning(running: boolean): void
  showNudge(show: boolean): void
  focusTask(window: WindowInfo): Promise<boolean>
  guideTask(window: WindowInfo): Promise<boolean>
  ocrLines(): Promise<string[]>
  pinNote(text: string, lineId: string): Promise<void>
  allowWindow(window: WindowInfo): Promise<void>
}

export type EffectOutcome = ActionResult & { ocrLines?: string[] }

/** Execute one reducer effect at the IO boundary. A failed action is returned to its tool caller. */
export async function executeEffect(
  effect: StudyEffect, state: StudyState, ports: EffectPorts,
): Promise<EffectOutcome> {
  try {
    switch (effect.type) {
      case 'CONNECT_LIVE':
        await ports.startLive({
          task: state.task, minutes: state.minutes, taskWindow: effect.window,
          state: state.phase, lastNextStep: state.lastNextStep,
        })
        break
      case 'DISCONNECT_LIVE': await ports.stopLive(); break
      case 'SEND_TURN': ports.sendTurn(effect.turn); break
      case 'START_CAPTURE': ports.setCaptureRunning(true); break
      case 'STOP_CAPTURE': ports.setCaptureRunning(false); break
      case 'OPEN_MIC': ports.setMicOpen(true); break
      case 'CLOSE_MIC': ports.setMicOpen(false); break
      case 'SET_CHECKIN_ACTIVE': ports.setCheckinActive(effect.active); break
      case 'SHOW_NUDGE': ports.showNudge(true); break
      case 'HIDE_NUDGE': ports.showNudge(false); break
      case 'FOCUS_TASK':
        if (!state.taskWindow || !await ports.focusTask(state.taskWindow)) {
          return { ok: false, error: 'The task window could not be opened.' }
        }
        break
      case 'GUIDE_TASK':
        if (!state.taskWindow || !await ports.guideTask(state.taskWindow)) {
          return { ok: false, error: 'The task tab could not be located.' }
        }
        break
      case 'RUN_OCR':
        return { ok: true, ocrLines: await ports.ocrLines() }
      case 'PIN_NOTE': await ports.pinNote(effect.text, effect.lineId); break
      case 'ALLOW_WINDOW':
        if (!state.currentWindow) return { ok: false, error: 'No current window to allow.' }
        await ports.allowWindow(state.currentWindow)
        break
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'The action failed.' }
  }
}
