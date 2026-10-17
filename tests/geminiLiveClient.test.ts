import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GeminiLiveClient } from '../src/main/gemini/liveClient'
import type { LiveSessionContext } from '../src/main/gemini/types'

const sdk = vi.hoisted(() => ({
  callbacks: undefined as undefined | { onmessage: (message: unknown) => void },
  callbacksList: [] as { onmessage: (message: unknown) => void }[],
  config: undefined as unknown,
  configs: [] as unknown[],
  turns: [] as unknown[],
  media: [] as unknown[],
  responses: [] as unknown[],
  closes: 0,
}))

vi.mock('@google/genai', () => ({
  Behavior: { NON_BLOCKING: 'NON_BLOCKING' },
  FunctionResponseScheduling: { SILENT: 'SILENT', WHEN_IDLE: 'WHEN_IDLE' },
  MediaResolution: { MEDIA_RESOLUTION_LOW: 'MEDIA_RESOLUTION_LOW' },
  Modality: { AUDIO: 'AUDIO' },
  GoogleGenAI: class {
    live = { connect: async ({ callbacks, config }: { callbacks: typeof sdk.callbacks; config: unknown }) => {
      sdk.callbacks = callbacks
      if (callbacks) sdk.callbacksList.push(callbacks)
      sdk.config = config
      sdk.configs.push(config)
      return {
        sendClientContent: (turn: unknown) => sdk.turns.push(turn),
        sendRealtimeInput: (media: unknown) => sdk.media.push(media),
        sendToolResponse: (response: unknown) => sdk.responses.push(response),
        close: () => { sdk.closes += 1 },
      }
    } }
  },
}))

const context: LiveSessionContext = {
  task: 'History essay', minutes: 30,
  taskWindow: {
    app: 'Google Chrome', bundleId: 'com.google.Chrome', title: 'Essay - Google Docs',
    url: 'https://docs.google.com/document/d/abc/edit',
    bounds: { x: 0, y: 0, width: 1280, height: 800 },
  },
}

beforeEach(() => {
  sdk.callbacks = undefined
  sdk.callbacksList.length = 0
  sdk.config = undefined
  sdk.configs.length = 0
  sdk.turns.length = 0
  sdk.media.length = 0
  sdk.responses.length = 0
  sdk.closes = 0
})

describe('GeminiLiveClient transport', () => {
  it('uses the verified Live config and maps media and tool scheduling', async () => {
    const client = new GeminiLiveClient('test-key')
    await client.connect(context)
    expect(sdk.config).toMatchObject({
      responseModalities: ['AUDIO'], mediaResolution: 'MEDIA_RESOLUTION_LOW',
      contextWindowCompression: { slidingWindow: {} }, sessionResumption: {},
      inputAudioTranscription: {}, outputAudioTranscription: {},
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } },
    })
    expect(sdk.config).not.toHaveProperty('proactivity')
    client.sendFrame('anBlZw==')
    client.sendAudio('cGNt')
    client.sendToolResponse({ id: 'call-1', name: 'report_status', response: { ok: true }, scheduling: 'silent' })
    expect(sdk.media).toEqual([
      { video: { data: 'anBlZw==', mimeType: 'image/jpeg' } },
      { audio: { data: 'cGNt', mimeType: 'audio/pcm;rate=16000' } },
    ])
    expect(sdk.responses).toEqual([{ functionResponses: [{
      id: 'call-1', name: 'report_status', response: { ok: true }, scheduling: 'SILENT',
    }] }])
    await client.disconnect()
    expect(sdk.closes).toBe(1)
  })

  it('queues complete turns until server turn completion and check-in end', async () => {
    const client = new GeminiLiveClient('test-key')
    await client.connect(context)
    client.sendTurn({ tag: 'SESSION_START', text: '[SESSION_START]', turnComplete: true })
    client.sendTurn({ tag: 'CHECK', text: '[CHECK]', turnComplete: true })
    expect(sdk.turns).toHaveLength(1)
    sdk.callbacks?.onmessage({ serverContent: {
      modelTurn: { parts: [{ inlineData: { data: 'cGNt', mimeType: 'audio/pcm' } }] },
    } })
    sdk.callbacks?.onmessage({ serverContent: { generationComplete: true } })
    expect(sdk.turns).toHaveLength(1)
    client.setCheckinActive(true)
    sdk.callbacks?.onmessage({ serverContent: { turnComplete: true } })
    expect(sdk.turns).toHaveLength(1)
    client.setCheckinActive(false)
    expect(sdk.turns).toHaveLength(2)
    await client.disconnect()
  })

  it('delivers a queued nudge after a silent screen check while check-in is open', async () => {
    const client = new GeminiLiveClient('test-key')
    await client.connect(context)
    client.sendTurn({ tag: 'CHECK', text: '[CHECK]', turnComplete: true })
    client.sendTurn({ tag: 'NUDGE', text: '[NUDGE]', turnComplete: true })
    client.setCheckinActive(true)
    expect(sdk.turns).toHaveLength(1)
    sdk.callbacks?.onmessage({ serverContent: { turnComplete: true } })
    expect(sdk.turns).toEqual([
      { turns: [{ role: 'user', parts: [{ text: '[CHECK]' }] }], turnComplete: true },
      { turns: [{ role: 'user', parts: [{ text: '[NUDGE]' }] }], turnComplete: true },
    ])
    await client.disconnect()
  })

  it('reports student speech from Live input transcription without storing the transcript', async () => {
    const client = new GeminiLiveClient('test-key')
    const events: unknown[] = []
    client.onEvent((event) => events.push(event))
    await client.connect(context)
    sdk.callbacks?.onmessage({ serverContent: { inputTranscription: { text: 'Take me back.' } } })
    sdk.callbacks?.onmessage({ serverContent: { inputTranscription: { text: '   ' } } })
    expect(events).toContainEqual({ type: 'user-transcription', text: 'Take me back.' })
    expect(events.filter((event) => (event as { type?: string }).type === 'user-transcription')).toHaveLength(1)
    await client.disconnect()
  })

  it('resumes after goAway and forwards media buffered during the handoff', async () => {
    const client = new GeminiLiveClient('test-key')
    const events: unknown[] = []
    client.onEvent((event) => events.push(event))
    await client.connect(context)
    sdk.callbacks?.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'resume-1' } })
    sdk.callbacks?.onmessage({ goAway: {} })
    client.sendFrame('ZnJhbWU=')
    client.sendTurn({ tag: 'CHECK', text: '[CHECK] after reconnect', turnComplete: true })

    await vi.waitFor(() => expect(sdk.configs).toHaveLength(2), { timeout: 2_000 })
    expect(sdk.configs[1]).toMatchObject({ sessionResumption: { handle: 'resume-1' } })
    expect(sdk.media).toContainEqual({ video: { data: 'ZnJhbWU=', mimeType: 'image/jpeg' } })
    expect(sdk.turns).toContainEqual({
      turns: [{ role: 'user', parts: [{ text: '[CHECK] after reconnect' }] }], turnComplete: true,
    })
    expect(events).toContainEqual({ type: 'connection', state: 'connected', resumed: true })
    await client.disconnect()
  })

  it('does not revive an old reconnect after a new study session starts', async () => {
    vi.useFakeTimers()
    try {
      const client = new GeminiLiveClient('test-key')
      const audio: string[] = []
      client.onEvent((event) => { if (event.type === 'audio') audio.push(event.pcm24Base64) })
      await client.connect(context)
      const oldCallbacks = sdk.callbacksList[0]!
      oldCallbacks.onmessage({ goAway: {} })
      await client.disconnect()
      await client.connect({ ...context, task: 'New session' })
      await vi.advanceTimersByTimeAsync(500)
      expect(sdk.configs).toHaveLength(2)
      oldCallbacks.onmessage({ serverContent: { modelTurn: { parts: [
        { inlineData: { data: 'b2xk', mimeType: 'audio/pcm' } },
      ] } } })
      sdk.callbacksList[1]!.onmessage({ serverContent: { modelTurn: { parts: [
        { inlineData: { data: 'bmV3', mimeType: 'audio/pcm' } },
      ] } } })
      expect(audio).toEqual(['bmV3'])
      await client.disconnect()
    } finally { vi.useRealTimers() }
  })
})
