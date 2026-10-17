<<<<<<< Updated upstream
<<<<<<< HEAD
import { app, ipcMain } from 'electron'
=======
import { app, ipcMain, screen } from 'electron'
>>>>>>> Stashed changes
import type { IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'
import { DEFAULTS, DEMO, DEMO_TASK } from '../../shared/config'
import { EmptySchema, IPC, IpcSchemas, type IpcChannel, type IpcPayload } from '../../shared/ipc'
import { ActionResultSchema, OverlayStateSchema, SessionSnapshotSchema, WindowInfoSchema } from '../../shared/types'
import type {
  ActionResult, NormalizedBox, NoteView, OverlayAction, OverlayPreview, OverlayState, RuleVerdict,
  SessionSnapshot, WindowInfo,
} from '../../shared/types'
import { GeminiLiveClient } from '../gemini/liveClient'
import type { AppWindows } from '../windows'
import { StudyEngine, createStudyToolHandlers } from './engine'
import type { EffectPorts } from './effects'
import { LiveSessionBridge } from './liveSession'
import { effectiveVerdict } from './offline'
import { applyPreviewAction, createOverlayPreview, OVERLAY_PREVIEWS } from './overlayPreview'
import { createSessionNote, visibleNotes } from './sessionNote'
import { PerceptionController } from './perception'

export interface SessionHooks {
  // M2 calls this after its three-second active-window lock resolves.
  activateTaskWindow(window: WindowInfo): Promise<ActionResult>
  // M2 calls this on active-window changes and classification ticks.
  observeWindow(window: WindowInfo, verdict: RuleVerdict, matchesTask: boolean): Promise<ActionResult>
  togglePushToTalk(): ActionResult
  togglePause(): Promise<ActionResult>
  toggleHud(): ActionResult
  requestFullFrame(): Promise<IpcPayload<typeof IPC.frameFull>>
  dispose(): void
}

export type SessionActionPorts = Pick<EffectPorts, 'focusTask' | 'guideTask' | 'ocrLines' | 'allowWindow'> & {
  locateLine?(lineId: string): Promise<NormalizedBox | undefined>
}

// Track A supplies window observation and OS actions through this boundary.
export function registerScaffoldIpc(
  getWindows: () => AppWindows | undefined, actions?: SessionActionPorts,
): SessionHooks {
  const demoMode = process.env.DEMO_MODE === '1'
  let snapshot: SessionSnapshot = SessionSnapshotSchema.parse({
    state: 'IDLE', conn: 'disconnected', task: demoMode ? DEMO_TASK : '', minutes: 30,
    overlayPreview: 'hidden',
    settings: { demoMode, showHud: demoMode },
    stats: { framesPerMinute: 0, resumptionHandleAgeMs: null, transitions: [], logs: [], capture: { state: 'off' } },
  })
  let previewOverlay: OverlayState = createOverlayPreview('hidden', Date.now())
  let lastOverlayJson = ''
  let lastInteractiveKey = ''
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  app.once('before-quit', () => { clearTimeout(expiryTimer) })
  let caption = ''
  let nudgeVisible = false
  let sessionNotes: NoteView[] = []
  let noteSerial = 0
  let observed: { window: WindowInfo; verdict: RuleVerdict; matchesTask: boolean } | undefined
  let handleReceivedAt: number | undefined
<<<<<<< Updated upstream
  const frameTimes: number[] = []
=======
import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'
import { DEMO_TASK } from '../../shared/config'
import { EmptySchema, IPC, IpcSchemas, type IpcChannel } from '../../shared/ipc'
import { ActionResultSchema, OverlayStateSchema, SessionSnapshotSchema } from '../../shared/types'
import type { ActionResult, SessionSnapshot } from '../../shared/types'
import type { AppWindows } from '../windows'

// M0 only stores setup data. The reducer, timers, and Live connection arrive in M3/M4.
export function registerScaffoldIpc(getWindows: () => AppWindows | undefined): void {
  const demoMode = process.env.DEMO_MODE === '1'
  let snapshot: SessionSnapshot = SessionSnapshotSchema.parse({
    state: 'IDLE', conn: 'disconnected', task: demoMode ? DEMO_TASK : '', minutes: 30,
    settings: { demoMode, showHud: demoMode },
    stats: { framesPerMinute: 0, resumptionHandleAgeMs: null, transitions: [], logs: [] },
  })
>>>>>>> f5bb2fc (Scaffold)
=======
  let checkinMicOpen = false
  let pushToTalkOpen = false
>>>>>>> Stashed changes

  const isSender = (sender: Electron.WebContents, kind: keyof AppWindows): boolean =>
    getWindows()?.[kind].webContents === sender

  const publish = (): void => {
    const windows = getWindows()
    if (!windows) return
<<<<<<< Updated upstream
<<<<<<< HEAD
=======
    sessionNotes = visibleNotes(sessionNotes, Date.now())
>>>>>>> Stashed changes
    snapshot = { ...snapshot, stats: { ...snapshot.stats,
      resumptionHandleAgeMs: handleReceivedAt === undefined ? null : Math.max(0, Date.now() - handleReceivedAt),
    } }
    windows.control.webContents.send(IPC.sessionSnapshot, SessionSnapshotSchema.parse(snapshot))
    const sessionOverlay = OverlayStateSchema.parse({
      pill: { state: snapshot.state, offline: snapshot.conn === 'degraded',
        snoozeUntil: study.state.snoozeUntil, micOpen: snapshot.micOpen },
      nudge: nudgeVisible ? { text: 'Still with your task, or taking a break?' } : undefined,
      notes: sessionNotes, caption,
    })
    const isPreviewing = snapshot.state === 'IDLE' || snapshot.state === 'ENDED'
    const overlay = isPreviewing ? previewOverlay : sessionOverlay
    const interactiveKey = `${overlay.pill.state}|${Boolean(overlay.nudge)}|${overlay.notes.map((note) => note.id).join(',')}`
    if (interactiveKey !== lastInteractiveKey) {
      windows.overlay.setIgnoreMouseEvents(true, { forward: true })
      lastInteractiveKey = interactiveKey
    }
    const overlayJson = JSON.stringify(overlay)
    if (overlayJson !== lastOverlayJson) {
      windows.overlay.webContents.send(IPC.overlayState, OverlayStateSchema.parse(overlay))
      lastOverlayJson = overlayJson
    }

    clearTimeout(expiryTimer)
    const deadlines = [...previewOverlay.notes, ...sessionNotes].map((note) => note.expiresAt)
    if (previewOverlay.pill.snoozeUntil !== undefined) deadlines.push(previewOverlay.pill.snoozeUntil)
    if (deadlines.length) expiryTimer = setTimeout(() => {
      const now = Date.now()
      previewOverlay = { ...previewOverlay, notes: previewOverlay.notes.filter((note) => note.expiresAt > now) }
      sessionNotes = visibleNotes(sessionNotes, now)
      if (previewOverlay.pill.snoozeUntil !== undefined && previewOverlay.pill.snoozeUntil <= now) {
        previewOverlay = { ...previewOverlay, pill: { state: 'FOCUSED', offline: previewOverlay.pill.offline } }
        if (snapshot.overlayPreview === 'snoozed') snapshot = { ...snapshot, overlayPreview: 'focused' }
      }
      publish()
    }, Math.max(0, Math.min(...deadlines) - Date.now()))
  }

  const log = (message: string): void => {
    snapshot = { ...snapshot, stats: { ...snapshot.stats, logs: [...snapshot.stats.logs, message].slice(-50) } }
    console.info(message)
    publish()
  }

  const syncMic = (): void => {
    const active = !['IDLE', 'SETUP', 'PAUSED', 'ENDED'].includes(study.state.phase)
    const open = active && snapshot.conn === 'connected' && (checkinMicOpen || pushToTalkOpen)
    live.setMicOpen(open)
    snapshot = { ...snapshot, micOpen: open }
  }

  const ports: EffectPorts = {
    startLive: (context) => live.start(context), stopLive: () => live.stop(),
    sendTurn: (turn) => { if (snapshot.conn !== 'degraded') live.sendTurn(turn) }, setMicOpen: (open) => {
      checkinMicOpen = open
      syncMic()
      publish()
    },
    setCheckinActive: (active) => live.setCheckinActive(active),
    setCaptureRunning: (running) => perception.setCaptureRunning(running),
    showNudge: (show) => {
      nudgeVisible = show
      if (show && snapshot.conn === 'degraded') getWindows()?.media.webContents.send(IPC.audioChime, {})
      publish()
    },
    focusTask: (window) => actions?.focusTask(window) ?? Promise.resolve(false),
    guideTask: (window) => actions?.guideTask(window) ?? Promise.resolve(false),
    ocrLines: async () => {
      try { return await actions?.ocrLines() ?? [] }
      catch { log('OCR unavailable; using a margin note.'); return [] }
    },
    pinNote: async (text, lineId) => {
      let lineAnchor: NormalizedBox | undefined
      if (lineId !== 'none') {
        try { lineAnchor = await actions?.locateLine?.(lineId) }
        catch { log('Line location unavailable; using the document margin.') }
      }
      sessionNotes = [createSessionNote(
        `session-note-${++noteSerial}`, text, study.state.taskWindow,
        screen.getPrimaryDisplay().bounds, Date.now(), lineAnchor,
      )]
      publish()
    },
    allowWindow: (window) => actions?.allowWindow(window)
      ?? Promise.reject(new Error('The allow-list is not ready.')),
  }
  const study = new StudyEngine(demoMode ? DEMO : DEFAULTS, ports, (state, previous) => {
    if (state.phase === 'PAUSED' || state.phase === 'ENDED') pushToTalkOpen = false
    if (state.taskWindow) live.updateContext({
      task: state.task, minutes: state.minutes, taskWindow: state.taskWindow,
      state: state.phase, lastNextStep: state.lastNextStep,
    })
    snapshot = { ...snapshot, state: state.phase, task: state.task, minutes: state.minutes,
      taskWindow: state.taskWindow, lastStatus: state.lastStatus,
      stats: { ...snapshot.stats, currentWindow: state.currentWindow,
        transitions: state.phase === previous.phase ? snapshot.stats.transitions
          : [...snapshot.stats.transitions, { from: previous.phase, to: state.phase, at: Date.now() }].slice(-10),
      },
    }
    syncMic()
    publish()
  })
  const live = new LiveSessionBridge(new GeminiLiveClient(), createStudyToolHandlers(study), {
    playAudio: (pcm24Base64) => getWindows()?.media.webContents.send(IPC.audioPlay, { pcm24Base64 }),
    flushAudio: () => getWindows()?.media.webContents.send(IPC.audioFlush, {}),
    caption: (text) => { caption = text; publish() },
    userSpeech: () => { void study.dispatch({ type: 'USER_SPEECH' }) },
    micSet: (open) => getWindows()?.media.webContents.send(IPC.micSet, { open }),
    connection: (conn) => {
      snapshot = { ...snapshot, conn }
      syncMic()
      log(`Live connection: ${conn}`)
      if (conn === 'degraded' && observed) {
        void study.dispatch({ type: 'WINDOW_OBSERVED', ...observed,
          verdict: effectiveVerdict(observed.verdict, conn) })
      }
    },
    resumptionHandle: (receivedAt) => { handleReceivedAt = receivedAt; publish() },
    error: () => log('Live connection error'),
  })
  const activateTaskWindow = async (window: WindowInfo): Promise<ActionResult> => {
    if (snapshot.state !== 'SETUP') return { ok: false, error: 'Save a task before locking its window.' }
    const taskWindow = WindowInfoSchema.safeParse(window)
    if (!taskWindow.success) return { ok: false, error: 'Invalid task window.' }
    return study.dispatch({ type: 'LOCK_WINDOW', window: taskWindow.data })
  }
  const observeWindow = async (window: WindowInfo, verdict: RuleVerdict,
    matchesTask: boolean): Promise<ActionResult> => {
    const parsed = WindowInfoSchema.safeParse(window)
    if (!parsed.success) return { ok: false, error: 'Invalid active window.' }
    observed = { window: parsed.data, verdict, matchesTask }
    snapshot = { ...snapshot, stats: { ...snapshot.stats, ruleVerdict: verdict } }
    return study.dispatch({ type: 'WINDOW_OBSERVED', ...observed,
      verdict: effectiveVerdict(observed.verdict, snapshot.conn) })
  }
  const perception = new PerceptionController({
    getWindows, getSnapshot: () => snapshot,
    updateSnapshot: (update) => { snapshot = update(snapshot) },
    getPhase: () => study.state.phase,
    activateTaskWindow, observeWindow,
    onWindowUnavailable: () => { observed = undefined },
    pause: () => study.dispatch({ type: 'PAUSE' }),
    publish, log,
  })
  app.once('before-quit', () => { perception.dispose() })

  let tickMs = demoMode ? DEMO.tickMs : DEFAULTS.tickMs
  let lastCheckAt = Date.now()
  setInterval(() => {
    if (['DRIFTING', 'CHECKIN', 'RETURNING', 'REENTRY', 'SNOOZED'].includes(study.state.phase)) {
      void study.dispatch({ type: 'TICK' })
    }
    const now = Date.now()
    if (now - lastCheckAt >= tickMs) {
      lastCheckAt = now
      if (observed && (study.state.phase === 'FOCUSED' || study.state.phase === 'DRIFTING')) {
        void study.dispatch({ type: 'WINDOW_OBSERVED', ...observed,
          verdict: effectiveVerdict(observed.verdict, snapshot.conn) })
      }
    }
  }, 500).unref()

  const handle = <T>(channel: IpcChannel, schema: z.ZodType<T>, action: (payload: T) => ActionResult | Promise<ActionResult>): void => {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, payload: unknown) => {
=======
    windows.control.webContents.send(IPC.sessionSnapshot, SessionSnapshotSchema.parse(snapshot))
    windows.overlay.webContents.send(IPC.overlayState, OverlayStateSchema.parse({
      pill: { state: snapshot.state, offline: false }, notes: [],
    }))
  }

  const handle = <T>(channel: IpcChannel, schema: z.ZodType<T>, action: (payload: T) => ActionResult): void => {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, payload: unknown) => {
>>>>>>> f5bb2fc (Scaffold)
      if (!isSender(event.sender, 'control') || event.senderFrame !== event.sender.mainFrame) {
        return { ok: false, error: 'This command is only available in the control window.' }
      }
      const parsed = schema.safeParse(payload)
      if (!parsed.success) return { ok: false, error: 'Invalid command payload.' }
      try {
<<<<<<< HEAD
        const result = ActionResultSchema.parse(await action(parsed.data))
=======
        const result = ActionResultSchema.parse(action(parsed.data))
>>>>>>> f5bb2fc (Scaffold)
        publish()
        return result
      } catch {
        console.error(`Scaffold command failed: ${channel}`)
        return { ok: false, error: 'The command could not be completed.' }
      }
    })
  }

  ipcMain.handle(IPC.sessionSnapshot, (event, payload: unknown) => {
    if (!isSender(event.sender, 'control') || event.senderFrame !== event.sender.mainFrame
      || !EmptySchema.safeParse(payload).success) throw new Error('Invalid snapshot request')
    return SessionSnapshotSchema.parse(snapshot)
  })
  handle(IPC.sessionStart, IpcSchemas[IPC.sessionStart], (input) => {
    if (snapshot.state !== 'IDLE' && snapshot.state !== 'ENDED' && snapshot.state !== 'SETUP') {
      return { ok: false, error: 'End the current session before starting another.' }
    }
<<<<<<< Updated upstream
<<<<<<< HEAD
    return study.dispatch({ type: 'START_SETUP', ...input })
  })
  handle(IPC.sessionEnd, EmptySchema, () => study.dispatch({ type: 'END' }))
=======
    snapshot = { ...snapshot, ...input, state: 'SETUP' }
    return { ok: true }
  })
  handle(IPC.sessionEnd, EmptySchema, () => {
    snapshot = { ...snapshot, state: 'ENDED' }
    return { ok: true }
  })
>>>>>>> f5bb2fc (Scaffold)
  handle(IPC.sessionLockWindow, EmptySchema, () => ({
    ok: false, error: 'Task window locking is scheduled for M2.',
  }))
  handle(IPC.settingsSet, IpcSchemas[IPC.settingsSet], (settings) => {
    snapshot = { ...snapshot, settings: { ...snapshot.settings, ...settings } }
=======
    sessionNotes = []
    perception.cancelLock()
    return study.dispatch({ type: 'START_SETUP', ...input })
  })
  handle(IPC.sessionEnd, EmptySchema, async () => {
    perception.cancelLock()
    const result = await study.dispatch({ type: 'END' })
    sessionNotes = []
    return result
  })
  handle(IPC.sessionLockWindow, EmptySchema, () => perception.lockWindow())
  handle(IPC.captureSet, IpcSchemas[IPC.captureSet], ({ running }) => {
    if (running && study.state.phase === 'PAUSED') return study.dispatch({ type: 'RESUME' })
    if (!running && !['IDLE', 'SETUP', 'PAUSED', 'ENDED'].includes(study.state.phase)) {
      return study.dispatch({ type: 'PAUSE' })
    }
    return { ok: false, error: 'Lock your task window first.' }
  })
  handle(IPC.settingsSet, IpcSchemas[IPC.settingsSet], async (settings) => {
    const next = { ...snapshot.settings, ...settings,
      ...(settings.demoMode === true ? { showHud: true } : {}) }
    snapshot = { ...snapshot, settings: next }
    if (settings.demoMode !== undefined) {
      const config = next.demoMode ? DEMO : DEFAULTS
      tickMs = config.tickMs
      lastCheckAt = Date.now()
      await study.dispatch({ type: 'SET_CONFIG', config })
      if (next.demoMode && snapshot.state === 'IDLE') snapshot = { ...snapshot, task: DEMO_TASK, minutes: 30 }
    }
>>>>>>> Stashed changes
    return { ok: true }
  })
<<<<<<< HEAD
  handle(IPC.overlayPreview, IpcSchemas[IPC.overlayPreview], ({ action }) => {
    if (app.isPackaged) return { ok: false, error: 'Overlay previews are available in development builds.' }
    const index = OVERLAY_PREVIEWS.indexOf(snapshot.overlayPreview ?? 'hidden')
    const preview = action === 'hide' ? 'hidden' : OVERLAY_PREVIEWS[(index + 1) % OVERLAY_PREVIEWS.length] ?? 'hidden'
    snapshot = { ...snapshot, overlayPreview: preview }
    previewOverlay = createOverlayPreview(preview, Date.now())
    return { ok: true }
  })

  // Validate all incoming event channels before forwarding media or overlay events.
  for (const channel of [
    IPC.frame, IPC.frameFull, IPC.micChunk, IPC.overlayAction, IPC.overlayHover, IPC.overlayReady,
    IPC.mediaReady, IPC.captureStatus,
  ]) {
    ipcMain.on(channel, (event, payload: unknown) => {
      const kind = channel.startsWith('overlay:') ? 'overlay' : 'media'
=======

  // Validate all incoming event channels, even while their consumers are scaffold placeholders.
  for (const channel of [IPC.frame, IPC.frameFull, IPC.micChunk, IPC.overlayAction, IPC.overlayHover]) {
    ipcMain.on(channel, (event, payload: unknown) => {
      const kind = channel === IPC.overlayAction || channel === IPC.overlayHover ? 'overlay' : 'media'
>>>>>>> f5bb2fc (Scaffold)
      if (!isSender(event.sender, kind) || event.senderFrame !== event.sender.mainFrame) return
      const parsed = IpcSchemas[channel].safeParse(payload)
      if (!parsed.success) { console.error(`Invalid IPC payload: ${channel}`); return }
      if (channel === IPC.overlayHover) {
        const { interactive } = IpcSchemas[IPC.overlayHover].parse(parsed.data)
        getWindows()?.overlay.setIgnoreMouseEvents(!interactive, { forward: true })
<<<<<<< HEAD
      } else if (channel === IPC.overlayReady) {
        lastOverlayJson = ''
        lastInteractiveKey = ''
        publish()
      } else if (channel === IPC.mediaReady) {
        perception.sendCaptureState()
      } else if (channel === IPC.captureStatus) {
        perception.handleCaptureStatus(IpcSchemas[IPC.captureStatus].parse(parsed.data))
      } else if (channel === IPC.frameFull) {
        perception.handleFullFrame(IpcSchemas[IPC.frameFull].parse(parsed.data))
      } else if (channel === IPC.frame) {
        const frame = IpcSchemas[IPC.frame].parse(parsed.data)
        if (perception.acceptFrame()) { live.sendFrame(frame.jpegBase64); publish() }
      } else if (channel === IPC.micChunk) {
        live.sendMicChunk(IpcSchemas[IPC.micChunk].parse(parsed.data).pcm16Base64)
      } else if (channel === IPC.overlayAction) {
        const action = IpcSchemas[IPC.overlayAction].parse(parsed.data)
        if ((snapshot.state === 'IDLE' || snapshot.state === 'ENDED')
          && snapshot.overlayPreview !== 'hidden') {
          previewOverlay = applyPreviewAction(previewOverlay, action, Date.now())
          const previews: Record<OverlayAction['kind'], OverlayPreview> = {
            'take-me-back': 'note', snooze: 'snoozed', allow: 'focused', pause: 'paused', resume: 'focused',
            'dismiss-note': snapshot.overlayPreview ?? 'hidden',
          }
          snapshot = { ...snapshot, overlayPreview: previews[action.kind], stats: {
            ...snapshot.stats, logs: [...snapshot.stats.logs, `Overlay preview: ${action.kind}`].slice(-50),
          } }
          publish()
          return
        }
        if (action.kind === 'dismiss-note') {
          sessionNotes = sessionNotes.filter((note) => note.id !== action.id)
          publish()
          return
        }
        const event = action.kind === 'take-me-back' ? { type: 'RETURN_REQUEST' as const, mode: 'focused' as const }
          : action.kind === 'snooze' ? { type: 'SNOOZE' as const, minutes: DEFAULTS.snoozeDefaultMin }
            : action.kind === 'allow' ? { type: 'ALLOW_CURRENT' as const }
              : action.kind === 'pause' ? { type: 'PAUSE' as const }
                : action.kind === 'resume' ? { type: 'RESUME' as const } : undefined
        if (event) void study.dispatch(event).then((result) => {
          if (!result.ok) log(`Overlay action failed: ${result.error}`)
        })
      }
    })
  }

  return {
    activateTaskWindow, observeWindow,
    requestFullFrame: () => perception.requestFullFrame(),
    dispose: () => perception.dispose(),
    togglePushToTalk: () => {
      if (['IDLE', 'SETUP', 'PAUSED', 'ENDED'].includes(study.state.phase)) {
        return { ok: false, error: 'Start or resume a study session to use push-to-talk.' }
      }
      if (snapshot.conn !== 'connected') return { ok: false, error: 'Voice is unavailable while offline.' }
      pushToTalkOpen = !pushToTalkOpen
      syncMic()
      publish()
      return { ok: true }
    },
    togglePause: () => {
      if (['IDLE', 'SETUP', 'ENDED'].includes(study.state.phase)) {
        return Promise.resolve({ ok: false, error: 'Start a study session to pause it.' })
      }
      return study.dispatch({ type: study.state.phase === 'PAUSED' ? 'RESUME' : 'PAUSE' })
    },
    toggleHud: () => {
      snapshot = { ...snapshot, settings: { ...snapshot.settings, showHud: !snapshot.settings.showHud } }
      publish()
      return { ok: true }
    },
  }
=======
      }
    })
  }
>>>>>>> f5bb2fc (Scaffold)
}
