import { describe, expect, it, vi } from 'vitest'
import { LiveSessionBridge } from '../src/main/session/liveSession'
import type { LiveSessionContext } from '../src/main/gemini/types'
import type { ToolHandlers } from '../src/main/gemini/tools'
import { FakeLiveClient } from './fakes/FakeLiveClient'

const context: LiveSessionContext = {
  task: 'History essay', minutes: 30,
  taskWindow: {
    app: 'Google Chrome', bundleId: 'com.google.Chrome', title: 'History essay - Google Docs',
    url: 'https://docs.google.com/document/d/doc-123/edit',
    bounds: { x: 0, y: 0, width: 1280, height: 800 },
  },
}

const handlers: ToolHandlers = {
  reportStatus: async () => ({ ok: true }),
  focusTaskWindow: async () => ({ ok: true }),
  guideToTask: async () => ({ ok: true }),
  pinNextStep: async () => ({ ok: true }),
  snooze: async () => ({ ok: true }),
  allowCurrentWindow: async () => ({ ok: true }),
  endCheckin: async () => ({ ok: true }),
  setTask: async () => ({ ok: true }),
}

describe('LiveSessionBridge', () => {
  it('routes turns, media and captions, and closes audio on stop', async () => {
    const client = new FakeLiveClient()
    const sinks = {
      playAudio: vi.fn(), flushAudio: vi.fn(), resetAudio: vi.fn(),
      caption: vi.fn(), userSpeech: vi.fn(), micSet: vi.fn(),
      connection: vi.fn(), resumptionHandle: vi.fn(), error: vi.fn(),
    }
    const bridge = new LiveSessionBridge(client, handlers, sinks)
    await bridge.start(context)
    bridge.sendTurn({ tag: 'SESSION_START', text: '[SESSION_START]', turnComplete: true })
    expect(client.turns).toMatchObject([{ tag: 'SESSION_START', turnComplete: true }])
    client.emit({ type: 'connection', state: 'connected', resumed: true })
    expect(client.turns).toHaveLength(1)

    bridge.sendFrame('anBlZw==')
    bridge.sendMicChunk('before-open')
    bridge.setMicOpen(true)
    bridge.sendMicChunk('after-open')
    client.script([
      { type: 'audio', pcm24Base64: 'cGNt' },
      { type: 'transcription', text: 'Back to the essay.' },
      { type: 'user-transcription', text: 'Take me back.' },
      { type: 'resumption-handle', receivedAt: 123 },
      { type: 'interrupted' },
    ])
    expect(client.frames).toEqual(['anBlZw=='])
    expect(client.audioChunks).toEqual(['after-open'])
    expect(sinks.playAudio).toHaveBeenCalledWith('cGNt')
    expect(sinks.caption).toHaveBeenCalledWith('Back to the essay.')
    expect(sinks.userSpeech).toHaveBeenCalledWith('Take me back.')
    expect(sinks.resumptionHandle).toHaveBeenCalledWith(123)
    expect(sinks.flushAudio).toHaveBeenCalledTimes(1)

    client.emit({ type: 'connection', state: 'reconnecting' })
    expect(sinks.flushAudio).toHaveBeenCalledTimes(2)
    expect(sinks.caption).toHaveBeenLastCalledWith('')

    await bridge.stop()
    expect(sinks.resetAudio).toHaveBeenCalledOnce()
    expect(client.audioStreamEnds).toBe(1)
    expect(sinks.micSet).toHaveBeenLastCalledWith(false)
    expect(client.disconnects).toBe(1)
    expect(sinks.connection).toHaveBeenLastCalledWith('disconnected')
    bridge.dispose()
  })

  it('responds to each tool call with its id and silent scheduling', async () => {
    const client = new FakeLiveClient()
    const bridge = new LiveSessionBridge(client, handlers, {
      playAudio: () => {}, flushAudio: () => {}, resetAudio: () => {},
      caption: () => {}, userSpeech: () => {}, micSet: () => {},
      connection: () => {}, resumptionHandle: () => {}, error: () => {},
    })
    await bridge.start(context)
    client.emit({ type: 'tool-call', call: { id: 'status-1', name: 'report_status', args: {
      check_id: 'check-1', on_task: false, activity: 'Watching a video', confidence: 0.8,
    } } })
    await vi.waitFor(() => expect(client.toolResponses).toHaveLength(1))
    expect(client.toolResponses[0]).toMatchObject({ id: 'status-1', scheduling: 'silent', response: { ok: true } })
    await bridge.stop()
    bridge.dispose()
  })

  it('waits for the old Live session to close before starting another', async () => {
    const client = new FakeLiveClient()
    let releaseDisconnect: (() => void) | undefined
    const disconnectWait = new Promise<void>((resolve) => { releaseDisconnect = resolve })
    const disconnect = client.disconnect.bind(client)
    vi.spyOn(client, 'disconnect').mockImplementation(async () => {
      await disconnectWait
      await disconnect()
    })
    const sinks = {
      playAudio: vi.fn(), flushAudio: vi.fn(), resetAudio: vi.fn(),
      caption: vi.fn(), userSpeech: vi.fn(), micSet: vi.fn(),
      connection: vi.fn(), resumptionHandle: vi.fn(), error: vi.fn(),
    }
    const bridge = new LiveSessionBridge(client, handlers, sinks)
    await bridge.start(context)
    const stopping = bridge.stop()
    const starting = bridge.start({ ...context, task: 'New session' })
    await Promise.resolve()
    expect(client.connections).toHaveLength(1)
    expect(sinks.resetAudio).toHaveBeenCalledOnce()
    releaseDisconnect!()
    await Promise.all([stopping, starting])
    expect(client.connections).toHaveLength(2)
    expect(client.connections[1]!.task).toBe('New session')
    await bridge.stop()
    bridge.dispose()
  })

  it('cancels a pending start if the study session ends again', async () => {
    const client = new FakeLiveClient()
    let releaseDisconnect: (() => void) | undefined
    const disconnectWait = new Promise<void>((resolve) => { releaseDisconnect = resolve })
    const disconnect = client.disconnect.bind(client)
    vi.spyOn(client, 'disconnect').mockImplementation(async () => {
      await disconnectWait
      await disconnect()
    })
    const bridge = new LiveSessionBridge(client, handlers, {
      playAudio: () => {}, flushAudio: () => {}, resetAudio: () => {},
      caption: () => {}, userSpeech: () => {}, micSet: () => {},
      connection: () => {}, resumptionHandle: () => {}, error: () => {},
    })
    await bridge.start(context)
    const stopping = bridge.stop()
    const starting = bridge.start({ ...context, task: 'Cancelled session' })
    const secondStop = bridge.stop()
    releaseDisconnect!()
    await Promise.all([stopping, secondStop])
    await expect(starting).rejects.toThrow('cancelled')
    expect(client.connections).toHaveLength(1)
    bridge.dispose()
  })
})
