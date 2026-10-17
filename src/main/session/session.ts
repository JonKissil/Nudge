import { app, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'
import { DEFAULTS, DEMO, DEMO_TASK } from '../../shared/config'
import { EmptySchema, IPC, IpcSchemas, type IpcChannel } from '../../shared/ipc'
import { ActionResultSchema, OverlayStateSchema, SessionSnapshotSchema, WindowInfoSchema } from '../../shared/types'
import type {
  ActionResult, OverlayAction, OverlayPreview, OverlayState, RuleVerdict, SessionSnapshot, WindowInfo,
} from '../../shared/types'
import { GeminiLiveClient } from '../gemini/liveClient'
import type { AppWindows } from '../windows'
import { StudyEngine, createStudyToolHandlers } from './engine'
import type { EffectPorts } from './effects'
import { LiveSessionBridge } from './liveSession'
import { applyPreviewAction, createOverlayPreview, OVERLAY_PREVIEWS } from './overlayPreview'

export interface SessionHooks {
  // M2 calls this after its three-second active-window lock resolves.
  activateTaskWindow(window: WindowInfo): Promise<ActionResult>
  // M2 calls this on active-window changes and classification ticks.
  observeWindow(window: WindowInfo, verdict: RuleVerdict, matchesTask: boolean): Promise<ActionResult>
}

export type SessionActionPorts = Pick<EffectPorts, 'focusTask' | 'guideTask' | 'ocrLines' | 'pinNote' | 'allowWindow'>

// Track A supplies window observation and OS actions through this boundary.
export function registerScaffoldIpc(
  getWindows: () => AppWindows | undefined, actions?: SessionActionPorts,
): SessionHooks {
  const demoMode = process.env.DEMO_MODE === '1'
  let snapshot: SessionSnapshot = SessionSnapshotSchema.parse({
    state: 'IDLE', conn: 'disconnected', task: demoMode ? DEMO_TASK : '', minutes: 30,
    overlayPreview: 'hidden',
    settings: { demoMode, showHud: demoMode },
    stats: { framesPerMinute: 0, resumptionHandleAgeMs: null, transitions: [], logs: [] },
  })
  let previewOverlay: OverlayState = createOverlayPreview('hidden', Date.now())
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  app.once('before-quit', () => { clearTimeout(expiryTimer) })
  let caption = ''
  let nudgeVisible = false
  let observed: { window: WindowInfo; verdict: RuleVerdict; matchesTask: boolean } | undefined
  let handleReceivedAt: number | undefined
  const frameTimes: number[] = []

  const isSender = (sender: Electron.WebContents, kind: keyof AppWindows): boolean =>
    getWindows()?.[kind].webContents === sender

  const publish = (): void => {
    const windows = getWindows()
    if (!windows) return
    snapshot = { ...snapshot, stats: { ...snapshot.stats,
      resumptionHandleAgeMs: handleReceivedAt === undefined ? null : Math.max(0, Date.now() - handleReceivedAt),
    } }
    windows.control.webContents.send(IPC.sessionSnapshot, SessionSnapshotSchema.parse(snapshot))
    const sessionOverlay = OverlayStateSchema.parse({
      pill: { state: snapshot.state, offline: snapshot.conn === 'degraded',
        snoozeUntil: study.state.snoozeUntil },
      nudge: nudgeVisible ? { text: 'Still with your task, or taking a break?' } : undefined,
      notes: [], caption,
    })
    const isPreviewing = snapshot.state === 'IDLE' || snapshot.state === 'ENDED'
    const overlay = isPreviewing ? previewOverlay : sessionOverlay
    windows.overlay.setIgnoreMouseEvents(true, { forward: true })
    windows.overlay.webContents.send(IPC.overlayState, OverlayStateSchema.parse(overlay))

    clearTimeout(expiryTimer)
    const deadlines = previewOverlay.notes.map((note) => note.expiresAt)
    if (previewOverlay.pill.snoozeUntil !== undefined) deadlines.push(previewOverlay.pill.snoozeUntil)
    if (deadlines.length) expiryTimer = setTimeout(() => {
      const now = Date.now()
      previewOverlay = { ...previewOverlay, notes: previewOverlay.notes.filter((note) => note.expiresAt > now) }
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

  const ports: EffectPorts = {
    startLive: (context) => live.start(context), stopLive: () => live.stop(),
    sendTurn: (turn) => live.sendTurn(turn), setMicOpen: (open) => live.setMicOpen(open),
    setCheckinActive: (active) => live.setCheckinActive(active),
    setCaptureRunning: (running) => getWindows()?.media.webContents.send(IPC.captureSet, { running }),
    showNudge: (show) => { nudgeVisible = show; publish() },
    focusTask: (window) => actions?.focusTask(window) ?? Promise.resolve(false),
    guideTask: (window) => actions?.guideTask(window) ?? Promise.resolve(false),
    ocrLines: () => actions?.ocrLines() ?? Promise.resolve([]),
    pinNote: (text, lineId) => actions?.pinNote(text, lineId)
      ?? Promise.reject(new Error('The note overlay is not ready.')),
    allowWindow: (window) => actions?.allowWindow(window)
      ?? Promise.reject(new Error('The allow-list is not ready.')),
  }
  const study = new StudyEngine(demoMode ? DEMO : DEFAULTS, ports, (state, previous) => {
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
    publish()
  })
  const live = new LiveSessionBridge(new GeminiLiveClient(), createStudyToolHandlers(study), {
    playAudio: (pcm24Base64) => getWindows()?.media.webContents.send(IPC.audioPlay, { pcm24Base64 }),
    flushAudio: () => getWindows()?.media.webContents.send(IPC.audioFlush, {}),
    caption: (text) => { caption = text; publish() },
    micSet: (open) => getWindows()?.media.webContents.send(IPC.micSet, { open }),
    connection: (conn) => { snapshot = { ...snapshot, conn }; log(`Live connection: ${conn}`) },
    resumptionHandle: (receivedAt) => { handleReceivedAt = receivedAt; publish() },
    error: () => log('Live connection error'),
  })

  const timers = demoMode ? DEMO : DEFAULTS
  setInterval(() => {
    if (['DRIFTING', 'CHECKIN', 'RETURNING', 'REENTRY', 'SNOOZED'].includes(study.state.phase)) {
      void study.dispatch({ type: 'TICK' })
    }
  }, 500).unref()
  setInterval(() => {
    if (observed && (study.state.phase === 'FOCUSED' || study.state.phase === 'DRIFTING')) {
      void study.dispatch({ type: 'WINDOW_OBSERVED', ...observed })
    }
  }, timers.tickMs).unref()

  const handle = <T>(channel: IpcChannel, schema: z.ZodType<T>, action: (payload: T) => ActionResult | Promise<ActionResult>): void => {
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, payload: unknown) => {
      if (!isSender(event.sender, 'control') || event.senderFrame !== event.sender.mainFrame) {
        return { ok: false, error: 'This command is only available in the control window.' }
      }
      const parsed = schema.safeParse(payload)
      if (!parsed.success) return { ok: false, error: 'Invalid command payload.' }
      try {
        const result = ActionResultSchema.parse(await action(parsed.data))
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
    return study.dispatch({ type: 'START_SETUP', ...input })
  })
  handle(IPC.sessionEnd, EmptySchema, () => study.dispatch({ type: 'END' }))
  handle(IPC.sessionLockWindow, EmptySchema, () => ({
    ok: false, error: 'Task window locking is scheduled for M2.',
  }))
  handle(IPC.settingsSet, IpcSchemas[IPC.settingsSet], (settings) => {
    snapshot = { ...snapshot, settings: { ...snapshot.settings, ...settings } }
    return { ok: true }
  })
  handle(IPC.overlayPreview, IpcSchemas[IPC.overlayPreview], ({ action }) => {
    if (app.isPackaged) return { ok: false, error: 'Overlay previews are available in development builds.' }
    const index = OVERLAY_PREVIEWS.indexOf(snapshot.overlayPreview ?? 'hidden')
    const preview = action === 'hide' ? 'hidden' : OVERLAY_PREVIEWS[(index + 1) % OVERLAY_PREVIEWS.length] ?? 'hidden'
    snapshot = { ...snapshot, overlayPreview: preview }
    previewOverlay = createOverlayPreview(preview, Date.now())
    return { ok: true }
  })

  // Validate all incoming event channels, even while their consumers are scaffold placeholders.
  for (const channel of [
    IPC.frame, IPC.frameFull, IPC.micChunk, IPC.overlayAction, IPC.overlayHover, IPC.overlayReady,
  ]) {
    ipcMain.on(channel, (event, payload: unknown) => {
      const kind = channel.startsWith('overlay:') ? 'overlay' : 'media'
      if (!isSender(event.sender, kind) || event.senderFrame !== event.sender.mainFrame) return
      const parsed = IpcSchemas[channel].safeParse(payload)
      if (!parsed.success) { console.error(`Invalid IPC payload: ${channel}`); return }
      if (channel === IPC.overlayHover) {
        const { interactive } = IpcSchemas[IPC.overlayHover].parse(parsed.data)
        getWindows()?.overlay.setIgnoreMouseEvents(!interactive, { forward: true })
      } else if (channel === IPC.overlayReady) {
        publish()
      } else if (channel === IPC.frame) {
        const frame = IpcSchemas[IPC.frame].parse(parsed.data)
        const now = Date.now()
        frameTimes.push(now)
        while (frameTimes[0] !== undefined && frameTimes[0] < now - 60_000) frameTimes.shift()
        snapshot = { ...snapshot, stats: { ...snapshot.stats, framesPerMinute: frameTimes.length } }
        if (study.state.phase !== 'PAUSED' && study.state.phase !== 'ENDED') live.sendFrame(frame.jpegBase64)
        publish()
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
    activateTaskWindow: async (window) => {
      if (snapshot.state !== 'SETUP') return { ok: false, error: 'Save a task before locking its window.' }
      const taskWindow = WindowInfoSchema.safeParse(window)
      if (!taskWindow.success) return { ok: false, error: 'Invalid task window.' }
      return study.dispatch({ type: 'LOCK_WINDOW', window: taskWindow.data })
    },
    observeWindow: async (window, verdict, matchesTask) => {
      const parsed = WindowInfoSchema.safeParse(window)
      if (!parsed.success) return { ok: false, error: 'Invalid active window.' }
      observed = { window: parsed.data, verdict, matchesTask }
      snapshot = { ...snapshot, stats: { ...snapshot.stats, ruleVerdict: verdict } }
      return study.dispatch({ type: 'WINDOW_OBSERVED', ...observed })
    },
  }
}
