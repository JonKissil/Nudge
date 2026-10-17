import { describe, expect, it } from 'vitest'
import { IPC, IpcSchemas } from '../src/shared/ipc'
import { SessionSnapshotSchema, StatusSchema } from '../src/shared/types'

describe('IPC boundaries', () => {
  it('trims task text and rejects missing or invalid setup fields', () => {
    const schema = IpcSchemas[IPC.sessionStart]
    expect(schema.parse({ task: '  History essay  ', minutes: 30 }).task).toBe('History essay')
    expect(schema.parse({ task: 'Essay', minutes: 30, language: 'es' }).language).toBe('es')
    for (const input of [
      {}, { task: ' ', minutes: 30 }, { task: 'Essay', minutes: 0 },
      { task: 'Essay', minutes: 1.5 }, { task: 'Essay', minutes: 241 },
      { task: 'Essay', minutes: '30' }, { task: 'Essay', minutes: 30, language: 'xx' },
      { task: 'Essay', minutes: 30, apiKey: 'unexpected' },
    ]) expect(schema.safeParse(input).success).toBe(false)
  })

  it('rejects invalid media without coercing it', () => {
    const schema = IpcSchemas[IPC.frame]
    expect(schema.safeParse({ jpegBase64: 'aGVsbG8=', width: 1280, height: 720, ts: 1 }).success).toBe(true)
    for (const input of [
      { jpegBase64: '', width: 1280, height: 720, ts: 1 },
      { jpegBase64: 'bad data!', width: 1280, height: 720, ts: 1 },
      { jpegBase64: 'aGVsbG8=', width: -1, height: 720, ts: 1 },
      { jpegBase64: 'aGVsbG8=', width: 1280, height: 720, ts: Number.NaN },
    ]) expect(schema.safeParse(input).success).toBe(false)
  })

  it('requires an id to dismiss a note and limits overlay actions', () => {
    const schema = IpcSchemas[IPC.overlayAction]
    expect(schema.safeParse({ kind: 'dismiss-note' }).success).toBe(false)
    expect(schema.safeParse({ kind: 'dismiss-note', id: 'note-1' }).success).toBe(true)
    expect(schema.safeParse({ kind: 'execute-code' }).success).toBe(false)
  })

  it('rejects overlay coordinates outside the display', () => {
    const schema = IpcSchemas[IPC.overlayState]
    const state = { pill: { state: 'FOCUSED', offline: false }, notes: [] }
    expect(schema.safeParse(state).success).toBe(true)
    expect(schema.safeParse({ ...state, arrow: { x: 1.1, y: 0.3, label: 'Your essay' } }).success).toBe(false)
    expect(schema.safeParse({ ...state, guidance: { text: 'Click: History essay' } }).success).toBe(true)
    expect(schema.safeParse({ ...state, guidance: { text: '' } }).success).toBe(false)
  })

  it('keeps empty commands and settings strict', () => {
    expect(IpcSchemas[IPC.sessionEnd].safeParse({ code: 'unexpected' }).success).toBe(false)
    expect(IpcSchemas[IPC.settingsSet].safeParse({ demoMode: true }).success).toBe(true)
    expect(IpcSchemas[IPC.settingsSet].safeParse({ apiKey: 'unexpected' }).success).toBe(false)
  })

  it('bounds classification confidence and activity length', () => {
    expect(StatusSchema.safeParse({ on_task: false, activity: 'Watching a video', confidence: 0.8 }).success).toBe(true)
    expect(StatusSchema.safeParse({ on_task: false, activity: 'Watching', confidence: 2 }).success).toBe(false)
    expect(StatusSchema.safeParse({ on_task: true, activity: 'one two three four five six seven eight nine', confidence: 1 }).success).toBe(false)
  })

  it('rejects unknown states and unbounded transition history in snapshots', () => {
    const snapshot = {
      state: 'IDLE', conn: 'disconnected', task: '', minutes: 30, language: 'en',
      settings: { demoMode: false, showHud: false },
      stats: { framesPerMinute: 0, resumptionHandleAgeMs: null, transitions: [], logs: [] },
    }
    expect(SessionSnapshotSchema.safeParse(snapshot).success).toBe(true)
    expect(SessionSnapshotSchema.safeParse({ ...snapshot, state: 'UNKNOWN' }).success).toBe(false)
    expect(SessionSnapshotSchema.safeParse({
      ...snapshot, stats: { ...snapshot.stats, transitions: Array.from({ length: 11 }, () => ({ from: 'IDLE', to: 'SETUP', at: 1 })) },
    }).success).toBe(false)
  })
})
