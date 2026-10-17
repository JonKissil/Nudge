import { DEFAULTS } from '../../shared/config'
import type { LanguageCode } from '../../shared/languages'
import type { RuleVerdict, SessionState, Status, WindowInfo } from '../../shared/types'
import { checkTurn, nudgeTurn, returnedTurn, sessionStartTurn, snoozeOverTurn } from '../gemini/prompts'
import type { LiveTurn } from '../gemini/types'
import { refreshedTaskUrl } from './taskUrl'

export interface StudyConfig {
  graceMs: number
  offTaskConfidence: number
  checkTimeoutMs?: number
  checkinSilenceMs: number
  silentSnoozeMs: number
  returnTimeoutMs: number
  maxNudgesPer10Min: number
}

export interface StudyState {
  phase: SessionState
  config: StudyConfig
  task: string
  minutes: number
  language: LanguageCode
  taskWindow?: WindowInfo
  currentWindow?: WindowInfo
  lastStatus?: Status
  driftSince?: number
  nudgeTimes: number[]
  checkPending: boolean
  checkSerial: number
  checkId?: string
  checkStartedAt?: number
  checkinLastHeardAt?: number
  snoozeUntil?: number
  returnUntil?: number
  returnMode?: 'focused' | 'guided'
  reentryAt?: number
  pinDueAt?: number
  ocrRequested: boolean
  reentrySent: boolean
  lastNextStep?: string
}

export type StudyEvent =
  | { type: 'SET_CONFIG'; config: StudyConfig }
  | { type: 'START_SETUP'; task: string; minutes: number; language?: LanguageCode }
  | { type: 'LOCK_WINDOW'; window: WindowInfo }
  | { type: 'WINDOW_OBSERVED'; window: WindowInfo; verdict: RuleVerdict; matchesTask: boolean }
  | { type: 'MODEL_STATUS'; status: Status; checkId: string }
  | { type: 'CHECK_FAILED'; checkId: string }
  | { type: 'WINDOW_UNAVAILABLE' }
  | { type: 'TASK_URL_UPDATED'; url: string }
  | { type: 'TICK' }
  | { type: 'NUDGE_SENT' }
  | { type: 'USER_SPEECH' }
  | { type: 'RETURN_REQUEST'; mode: 'focused' | 'guided' }
  | { type: 'RETURN_FAILED' }
  | { type: 'ARRIVED' }
  | { type: 'REENTRY_LINES'; lines: string[] }
  | { type: 'PIN_STEP'; text: string; lineId: string }
  | { type: 'SNOOZE'; minutes: number }
  | { type: 'ALLOW_CURRENT' }
  | { type: 'END_CHECKIN' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'END' }

export type StudyEffect =
  | { type: 'CONNECT_LIVE'; window: WindowInfo }
  | { type: 'DISCONNECT_LIVE' }
  | { type: 'SEND_TURN'; turn: LiveTurn }
  | { type: 'START_CAPTURE' | 'STOP_CAPTURE' | 'OPEN_MIC' | 'CLOSE_MIC' }
  | { type: 'SET_CHECKIN_ACTIVE'; active: boolean }
  | { type: 'SHOW_NUDGE' | 'HIDE_NUDGE' | 'RUN_OCR' | 'FOCUS_TASK' | 'GUIDE_TASK' }
  | { type: 'PIN_NOTE'; text: string; lineId: string }
  | { type: 'ALLOW_WINDOW' }

export interface StudyResult { state: StudyState; effects: StudyEffect[] }

export function createStudyState(config: StudyConfig = DEFAULTS): StudyState {
  return {
    phase: 'IDLE', config, task: '', minutes: 30, language: 'en',
    nudgeTimes: [], checkPending: false, checkSerial: 0, ocrRequested: false, reentrySent: false,
  }
}

function result(state: StudyState, effects: StudyEffect[] = []): StudyResult { return { state, effects } }

function windowKey(window: WindowInfo | undefined): string {
  return JSON.stringify(window && [window.app, window.bundleId, window.ownerPid, window.id, window.title, window.url])
}

function requestCheck(state: StudyState, window: WindowInfo, now: number): StudyResult {
  const checkSerial = state.checkSerial + 1
  const checkId = `check-${checkSerial}`
  return result({ ...state, checkSerial, checkId, checkPending: true, checkStartedAt: now }, [
    { type: 'SEND_TURN', turn: checkTurn(window, state.task, checkId) },
  ])
}

function enterReentry(state: StudyState, now: number): StudyResult {
  return result({
    ...state, phase: 'REENTRY', checkPending: false, reentryAt: now + 800,
    pinDueAt: now + 10_000, ocrRequested: false, reentrySent: false,
  }, [
    { type: 'CLOSE_MIC' }, { type: 'SET_CHECKIN_ACTIVE', active: false }, { type: 'HIDE_NUDGE' },
  ])
}

function snooze(state: StudyState, now: number, durationMs: number): StudyResult {
  return result({
    ...state, phase: 'SNOOZED', snoozeUntil: now + durationMs,
    checkPending: false, driftSince: undefined,
  }, [
    { type: 'CLOSE_MIC' }, { type: 'SET_CHECKIN_ACTIVE', active: false }, { type: 'HIDE_NUDGE' },
  ])
}

export function reduce(state: StudyState, event: StudyEvent, now: number): StudyResult {
  if (event.type === 'WINDOW_UNAVAILABLE') return result({ ...state, checkPending: false, currentWindow: undefined })
  if (event.type === 'TASK_URL_UPDATED') {
    const url = state.taskWindow && refreshedTaskUrl(state.taskWindow, event.url)
    return url && state.taskWindow && state.taskWindow.url !== url
      && ['FOCUSED', 'DRIFTING', 'SNOOZED', 'REENTRY'].includes(state.phase)
      ? result({ ...state, taskWindow: { ...state.taskWindow, url } }) : result(state)
  }
  if (event.type === 'SET_CONFIG') return result({ ...state, config: event.config })
  if (event.type === 'END' && state.phase !== 'ENDED') {
    return result({ ...state, phase: 'ENDED', checkPending: false }, [
      { type: 'CLOSE_MIC' }, { type: 'STOP_CAPTURE' },
      { type: 'SET_CHECKIN_ACTIVE', active: false }, { type: 'HIDE_NUDGE' }, { type: 'DISCONNECT_LIVE' },
    ])
  }
  if (event.type === 'START_SETUP' && (state.phase === 'IDLE' || state.phase === 'ENDED' || state.phase === 'SETUP')) {
    return result({ ...createStudyState(state.config), checkSerial: state.checkSerial,
      phase: 'SETUP', task: event.task, minutes: event.minutes, language: event.language ?? state.language })
  }
  if (event.type === 'LOCK_WINDOW' && state.phase === 'SETUP') {
    return result({ ...state, phase: 'FOCUSED', taskWindow: event.window }, [
      { type: 'CONNECT_LIVE', window: event.window }, { type: 'START_CAPTURE' },
      { type: 'SEND_TURN', turn: sessionStartTurn(state.task, state.minutes) },
    ])
  }
  if (event.type === 'PAUSE' && !['IDLE', 'SETUP', 'PAUSED', 'ENDED'].includes(state.phase)) {
    return result({ ...state, phase: 'PAUSED', driftSince: undefined, checkPending: false }, [
      { type: 'CLOSE_MIC' }, { type: 'SET_CHECKIN_ACTIVE', active: false },
      { type: 'STOP_CAPTURE' }, { type: 'HIDE_NUDGE' },
    ])
  }
  if (event.type === 'RESUME' && state.phase === 'PAUSED') {
    return result({ ...state, phase: 'FOCUSED' }, [{ type: 'START_CAPTURE' }])
  }
  if (event.type === 'WINDOW_OBSERVED') {
    if (event.verdict === 'ignore') return result(state)
    if ((state.phase === 'CHECKIN' || state.phase === 'RETURNING') && event.matchesTask) {
      return enterReentry({ ...state, currentWindow: event.window }, now)
    }
    if (state.phase !== 'FOCUSED' && state.phase !== 'DRIFTING') {
      return ['CHECKIN', 'RETURNING', 'SNOOZED'].includes(state.phase)
        ? result({ ...state, currentWindow: event.window }) : result(state)
    }
    const current = { ...state, currentWindow: event.window }
    if (event.verdict === 'on') {
      return result({ ...current, phase: 'FOCUSED', driftSince: undefined, checkPending: false })
    }
    if (event.verdict === 'off') {
      return result({ ...current, phase: 'DRIFTING', driftSince: state.driftSince ?? now, checkPending: false })
    }
    if (state.checkPending && windowKey(state.currentWindow) === windowKey(event.window)) return result(current)
    return requestCheck(current, event.window, now)
  }
  if (event.type === 'CHECK_FAILED' && state.checkPending && event.checkId === state.checkId
    && (state.phase === 'FOCUSED' || state.phase === 'DRIFTING')) {
    return result({ ...state, checkPending: false })
  }
  if (event.type === 'MODEL_STATUS' && state.checkPending && event.checkId === state.checkId
    && (state.phase === 'FOCUSED' || state.phase === 'DRIFTING')) {
    const offTask = !event.status.on_task && event.status.confidence >= state.config.offTaskConfidence
    return result({
      ...state, lastStatus: event.status, checkPending: false,
      phase: offTask ? 'DRIFTING' : 'FOCUSED',
      driftSince: offTask ? (state.driftSince ?? now) : undefined,
    })
  }
  if (event.type === 'TICK') {
    if (['FOCUSED', 'DRIFTING'].includes(state.phase) && state.checkPending && state.currentWindow
      && state.checkStartedAt !== undefined
      && now - state.checkStartedAt >= (state.config.checkTimeoutMs ?? DEFAULTS.checkTimeoutMs)) {
      return requestCheck(state, state.currentWindow, now)
    }
    if (state.phase === 'DRIFTING' && state.driftSince !== undefined && now - state.driftSince >= state.config.graceMs) {
      const recent = state.nudgeTimes.filter((time) => time > now - 10 * 60_000)
      if (recent.length >= state.config.maxNudgesPer10Min) return result({ ...state, nudgeTimes: recent })
      return result({ ...state, phase: 'NUDGING', checkPending: false, nudgeTimes: [...recent, now] }, [
        { type: 'SEND_TURN', turn: nudgeTurn() }, { type: 'SHOW_NUDGE' }, { type: 'OPEN_MIC' },
      ])
    }
    if (state.phase === 'CHECKIN' && state.checkinLastHeardAt !== undefined
      && now - state.checkinLastHeardAt >= state.config.checkinSilenceMs) {
      return snooze(state, now, state.config.silentSnoozeMs)
    }
    if (state.phase === 'RETURNING' && state.returnUntil !== undefined && now >= state.returnUntil) {
      return result({ ...state, phase: 'DRIFTING', driftSince: now, returnUntil: undefined }, [
        { type: 'CLOSE_MIC' }, { type: 'SET_CHECKIN_ACTIVE', active: false }, { type: 'HIDE_NUDGE' },
      ])
    }
    if (state.phase === 'REENTRY') {
      if (state.pinDueAt !== undefined && now >= state.pinDueAt) {
        return result({ ...state, phase: 'FOCUSED', returnMode: undefined }, [
          { type: 'PIN_NOTE', text: 'Pick up where you left off ↓', lineId: 'none' },
        ])
      }
      if (!state.ocrRequested && state.reentryAt !== undefined && now >= state.reentryAt) {
        return result({ ...state, ocrRequested: true }, [{ type: 'RUN_OCR' }])
      }
    }
    if (state.phase === 'SNOOZED' && state.snoozeUntil !== undefined && now >= state.snoozeUntil) {
      return result({ ...state, phase: 'FOCUSED', snoozeUntil: undefined }, [
        { type: 'SEND_TURN', turn: snoozeOverTurn() },
      ])
    }
    return result(state)
  }
  if (event.type === 'NUDGE_SENT' && state.phase === 'NUDGING') {
    return result({ ...state, phase: 'CHECKIN', checkinLastHeardAt: now }, [
      { type: 'SET_CHECKIN_ACTIVE', active: true },
    ])
  }
  if (event.type === 'USER_SPEECH' && state.phase === 'CHECKIN') {
    return result({ ...state, checkinLastHeardAt: now })
  }
  if (event.type === 'RETURN_REQUEST' && (state.phase === 'CHECKIN'
    || (state.phase === 'RETURNING' && state.returnMode === 'guided' && event.mode === 'focused'))) {
    return result({
      ...state, phase: 'RETURNING', returnMode: event.mode,
      returnUntil: now + state.config.returnTimeoutMs,
    }, [{ type: 'HIDE_NUDGE' }, { type: event.mode === 'focused' ? 'FOCUS_TASK' : 'GUIDE_TASK' }])
  }
  if (event.type === 'RETURN_FAILED' && state.phase === 'RETURNING') {
    return state.returnMode === 'focused'
      ? result({ ...state, returnMode: 'guided' }, [{ type: 'GUIDE_TASK' }])
      : result({ ...state, phase: 'CHECKIN', returnUntil: undefined })
  }
  if (event.type === 'ARRIVED' && (state.phase === 'CHECKIN' || state.phase === 'RETURNING')) {
    return enterReentry(state, now)
  }
  if (event.type === 'REENTRY_LINES' && state.phase === 'REENTRY' && !state.reentrySent) {
    return result({ ...state, reentrySent: true }, [
      { type: 'SEND_TURN', turn: returnedTurn(event.lines.slice(0, 60), state.returnMode === 'guided') },
    ])
  }
  if (event.type === 'PIN_STEP' && state.phase === 'REENTRY') {
    return result({ ...state, phase: 'FOCUSED', returnMode: undefined, lastNextStep: event.text }, [
      { type: 'PIN_NOTE', text: event.text, lineId: event.lineId },
    ])
  }
  if (event.type === 'SNOOZE' && state.phase === 'CHECKIN') {
    return snooze(state, now, Math.max(1, Math.min(30, event.minutes)) * 60_000)
  }
  if (event.type === 'ALLOW_CURRENT' && state.phase === 'CHECKIN') {
    return result({ ...state, phase: 'FOCUSED', driftSince: undefined }, [
      { type: 'ALLOW_WINDOW' }, { type: 'CLOSE_MIC' },
      { type: 'SET_CHECKIN_ACTIVE', active: false }, { type: 'HIDE_NUDGE' },
    ])
  }
  if (event.type === 'END_CHECKIN' && state.phase === 'CHECKIN') {
    return snooze(state, now, state.config.silentSnoozeMs)
  }
  return result(state)
}
