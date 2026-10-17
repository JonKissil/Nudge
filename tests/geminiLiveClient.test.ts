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
  MediaResolution: { MEDIA_RESOLUTION_MEDIUM: 'MEDIA_RESOLUTION_MEDIUM' },
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
      responseModalities: ['AUDIO'], mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
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

  it('queues complete turns during speech and discards obsolete checks at check-in', async () => {
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
    expect(sdk.turns).toHaveLength(1)
    client.sendTurn({ tag: 'CHECK', text: '[CHECK] fresh window', turnComplete: true })
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

  it('waits for a fresh video frame and keeps only the latest unsent check', async () => {
    const client = new GeminiLiveClient('test-key')
    await client.connect(context)
    client.sendFrame('old-essay-frame')
    client.sendTurn({ tag: 'CHECK', checkId: 'check-1', text: '[CHECK] old tab', turnComplete: true })
    client.sendTurn({ tag: 'CHECK', checkId: 'check-2', text: '[CHECK] current tab', turnComplete: true })
    expect(sdk.turns).toHaveLength(0)
    client.sendFrame('current-entertainment-frame')
    expect(sdk.turns).toHaveLength(1)
    expect(sdk.media).toEqual([{ video: { data: 'old-essay-frame', mimeType: 'image/jpeg' } }])
    expect(sdk.turns[0]).toMatchObject({ turns: [{ parts: [{ text: '[CHECK] current tab' }, { inlineData: { data: 'current-entertainment-frame', mimeType: 'image/jpeg' } }] }] })
    await client.disconnect()
  })

  it('keeps streaming during speech and binds a new capture after speech finishes', async () => {
    const client = new GeminiLiveClient('test-key')
    await client.connect(context)
    client.sendTurn({ tag: 'SESSION_START', text: '[SESSION_START]', turnComplete: true })
    client.sendTurn({ tag: 'CHECK', checkId: 'check-1', text: '[CHECK]', turnComplete: true })
    client.sendFrame('during-greeting')
    sdk.callbacks?.onmessage({ serverContent: { turnComplete: true } })
    expect(sdk.turns).toHaveLength(1)
    client.sendFrame('after-greeting')
    expect(sdk.turns.at(-1)).toMatchObject({ turns: [{ parts: [
      { text: '[CHECK]' }, { inlineData: { data: 'after-greeting', mimeType: 'image/jpeg' } },
    ] }] })
    expect(sdk.media).toEqual([{ video: { data: 'during-greeting', mimeType: 'image/jpeg' } }])
    await client.disconnect()
  })

  it('does not resend the cached image when reconnecting during pause', async () => {
    vi.useFakeTimers()
    const client = new GeminiLiveClient('test-key')
    try {
      await client.connect(context)
      client.sendFrame('before-pause')
      client.updateContext({ ...context, state: 'PAUSED' })
      sdk.callbacks?.onmessage({ goAway: {} })
      await vi.advanceTimersByTimeAsync(500)
      expect(sdk.configs).toHaveLength(2)
      expect(sdk.media).toHaveLength(1)
    } finally { await client.disconnect(); vi.useRealTimers() }
  })

  it('releases a check on turn completion even if the model speaks instead of reporting', async () => {
    const client = new GeminiLiveClient('test-key')
    const events: unknown[] = []
    client.onEvent((event) => events.push(event))
    await client.connect(context)
    client.sendTurn({ tag: 'CHECK', checkId: 'check-1', text: '[CHECK]', turnComplete: true })
    client.sendFrame('frame')
    sdk.callbacks?.onmessage({ serverContent: { modelTurn: { parts: [
      { inlineData: { data: 'cGNt', mimeType: 'audio/pcm' } },
    ] }, outputTranscription: { text: 'Unexpected check narration' } } })
    expect(events.some((event) => ['audio', 'transcription'].includes((event as { type: string }).type))).toBe(false)
    sdk.callbacks?.onmessage({ serverContent: { generationComplete: true } })
    expect(events).not.toContainEqual({ type: 'check-complete', checkId: 'check-1' })
    sdk.callbacks?.onmessage({ serverContent: { turnComplete: true } })
    expect(events).toContainEqual({ type: 'check-complete', checkId: 'check-1' })
    client.sendAudio('cGNt')
    sdk.callbacks?.onmessage({ serverContent: { modelTurn: { parts: [
      { inlineData: { data: 'cGNt', mimeType: 'audio/pcm' } },
    ] }, outputTranscription: { text: 'A student reply' } } })
    expect(events).toContainEqual({ type: 'audio', pcm24Base64: 'cGNt' })
    expect(events).toContainEqual({ type: 'transcription', text: 'A student reply' })
    await client.disconnect()
  })

  it('does not leave a nudge behind an unsent check waiting for a frame', async () => {
    const client = new GeminiLiveClient('test-key')
    await client.connect(context)
    client.sendTurn({ tag: 'CHECK', checkId: 'check-1', text: '[CHECK]', turnComplete: true })
    client.sendTurn({ tag: 'NUDGE', text: '[NUDGE]', turnComplete: true })
    client.setCheckinActive(true)
    expect(sdk.turns).toEqual([{ turns: [{ role: 'user', parts: [{ text: '[NUDGE]' }] }], turnComplete: true }])
    await client.disconnect()
  })

  it('recovers the connection if a check never completes, then sends the fresh retry', async () => {
    vi.useFakeTimers()
    const client = new GeminiLiveClient('test-key')
    try {
      await client.connect(context)
      client.sendTurn({ tag: 'CHECK', checkId: 'check-1', text: '[CHECK] stalled', turnComplete: true })
      client.sendFrame('first')
      await vi.advanceTimersByTimeAsync(10_000)
      client.sendTurn({ tag: 'CHECK', checkId: 'check-2', text: '[CHECK] retry', turnComplete: true })
      client.sendFrame('fresh')
      await vi.advanceTimersByTimeAsync(500)
      expect(sdk.configs).toHaveLength(2)
      expect(sdk.closes).toBe(1)
      expect(sdk.turns).toHaveLength(1)
      client.sendFrame('post-reconnect')
      expect(sdk.turns.at(-1)).toMatchObject({ turns: [{ parts: [{ text: '[CHECK] retry' }, { inlineData: { data: 'post-reconnect', mimeType: 'image/jpeg' } }] }] })
    } finally { await client.disconnect(); vi.useRealTimers() }
  })

  it('recovers a stalled check even when a nudge is waiting behind it', async () => {
    vi.useFakeTimers()
    const client = new GeminiLiveClient('test-key')
    try {
      await client.connect(context)
      client.sendTurn({ tag: 'CHECK', checkId: 'check-1', text: '[CHECK] stalled', turnComplete: true })
      client.sendFrame('frame')
      client.sendTurn({ tag: 'NUDGE', text: '[NUDGE]', turnComplete: true })
      client.setCheckinActive(true)
      await vi.advanceTimersByTimeAsync(10_500)
      expect(sdk.configs).toHaveLength(2)
      expect(sdk.turns.at(-1)).toMatchObject({ turns: [{ parts: [{ text: '[NUDGE]' }] }] })
    } finally { await client.disconnect(); vi.useRealTimers() }
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
