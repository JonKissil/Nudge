import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GeminiLiveClient } from '../src/main/gemini/liveClient'
import type { LiveSessionContext } from '../src/main/gemini/types'

const sdk = vi.hoisted(() => ({
  callbacks: undefined as undefined | {
    onmessage: (message: unknown) => void; onerror: (error: Error) => void; onclose: () => void
  },
  callbacksList: [] as { onmessage: (message: unknown) => void; onerror: (error: Error) => void; onclose: () => void }[],
  config: undefined as unknown,
  configs: [] as unknown[],
  connectOutcomes: [] as ('ok' | 'reject' | 'hang')[],
  lateConnects: [] as ((session: unknown) => void)[],
  sessions: [] as unknown[],
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
      const session = {
        sendClientContent: (turn: unknown) => sdk.turns.push(turn),
        sendRealtimeInput: (media: unknown) => sdk.media.push(media),
        sendToolResponse: (response: unknown) => sdk.responses.push(response),
        close: () => { sdk.closes += 1 },
      }
      sdk.sessions.push(session)
      const outcome = sdk.connectOutcomes.shift() ?? 'ok'
      if (outcome === 'reject') throw new Error('Connection refused')
      if (outcome === 'hang') return new Promise((resolve) => { sdk.lateConnects.push(resolve) })
      return session
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
  sdk.connectOutcomes.length = 0
  sdk.lateConnects.length = 0
  sdk.sessions.length = 0
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
    expect(events).toContainEqual({ type: 'connection', state: 'connected', resumed: true, restored: false })
    await client.disconnect()
  })

  it('waits for an in-flight model turn to finish after resumption', async () => {
    vi.useFakeTimers()
    try {
      const client = new GeminiLiveClient('test-key')
      await client.connect(context)
      client.sendTurn({ tag: 'CHECK', text: '[CHECK] active', turnComplete: true })
      sdk.callbacks?.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'resume-1' } })
      sdk.callbacks?.onmessage({ goAway: {} })
      client.sendTurn({ tag: 'NUDGE', text: '[NUDGE]', turnComplete: true })
      await vi.advanceTimersByTimeAsync(500)
      expect(sdk.turns).toHaveLength(1)
      sdk.callbacks?.onmessage({ serverContent: { turnComplete: true } })
      expect(sdk.turns).toHaveLength(2)
      await client.disconnect()
    } finally { vi.useRealTimers() }
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

  it('restores context before other work on a fresh connection and drops old tool replies', async () => {
    vi.useFakeTimers()
    try {
      const client = new GeminiLiveClient('test-key')
      const events: { type: string; sessionEpoch?: number }[] = []
      client.onEvent((event) => events.push(event))
      await client.connect(context)
      sdk.callbacks?.onmessage({ toolCall: { functionCalls: [{ id: 'old-call', name: 'report_status' }] } })
      const oldEpoch = events.find((event) => event.type === 'tool-call')?.sessionEpoch
      sdk.callbacks?.onmessage({ goAway: {} })
      client.sendToolResponse({ id: 'old-call', name: 'report_status', response: { ok: true },
        scheduling: 'silent', sessionEpoch: oldEpoch })
      client.sendTurn({ tag: 'CHECK', text: '[CHECK] stale window', turnComplete: true })
      await vi.advanceTimersByTimeAsync(500)
      expect(sdk.turns).toEqual([{ turns: [{ role: 'user', parts: [{ text: expect.stringContaining('[CONTEXT_RESTORE]') }] }],
        turnComplete: false }])
      expect(sdk.responses).toHaveLength(0)
      client.sendToolResponse({ id: 'old-call', name: 'report_status', response: { ok: true },
        scheduling: 'silent', sessionEpoch: oldEpoch })
      expect(sdk.responses).toHaveLength(0)
      await client.disconnect()
    } finally { vi.useRealTimers() }
  })

  it('does not reuse a handle after the server says resumption is unsafe', async () => {
    vi.useFakeTimers()
    try {
      const client = new GeminiLiveClient('test-key')
      const events: unknown[] = []
      client.onEvent((event) => events.push(event))
      await client.connect(context)
      sdk.callbacks?.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'old-handle' } })
      sdk.callbacks?.onmessage({ sessionResumptionUpdate: { resumable: false } })
      sdk.callbacks?.onmessage({ goAway: {} })
      await vi.advanceTimersByTimeAsync(500)
      expect(sdk.configs[1]).toMatchObject({ sessionResumption: {} })
      expect(sdk.turns[0]).toMatchObject({ turnComplete: false,
        turns: [{ parts: [{ text: expect.stringContaining('[CONTEXT_RESTORE]') }] }] })
      expect(events).toContainEqual({ type: 'resumption-handle', receivedAt: null })
      await client.disconnect()
    } finally { vi.useRealTimers() }
  })

  it('starts fresh with context after every attempt to resume fails', async () => {
    vi.useFakeTimers()
    try {
      const client = new GeminiLiveClient('test-key')
      await client.connect(context)
      sdk.callbacks?.onmessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'resume-1' } })
      sdk.connectOutcomes.push('reject', 'reject', 'reject', 'reject', 'reject', 'ok')
      sdk.callbacks?.onmessage({ goAway: {} })
      await vi.advanceTimersByTimeAsync(12_000)
      expect(sdk.configs).toHaveLength(7)
      expect(sdk.configs[5]).toMatchObject({ sessionResumption: { handle: 'resume-1' } })
      expect(sdk.configs[6]).toMatchObject({ sessionResumption: {} })
      expect(sdk.turns[0]).toMatchObject({ turnComplete: false,
        turns: [{ parts: [{ text: expect.stringContaining('[CONTEXT_RESTORE]') }] }] })
      sdk.callbacks?.onmessage({ goAway: {} })
      await vi.advanceTimersByTimeAsync(500)
      expect(sdk.configs[7]).toMatchObject({ sessionResumption: {} })
      await client.disconnect()
    } finally { vi.useRealTimers() }
  })

  it('recovers from an error callback even when no close callback arrives', async () => {
    vi.useFakeTimers()
    try {
      const client = new GeminiLiveClient('test-key')
      await client.connect(context)
      sdk.callbacks?.onerror(new Error('WebSocket failed'))
      await vi.advanceTimersByTimeAsync(500)
      expect(sdk.configs).toHaveLength(2)
      expect(sdk.turns[0]).toMatchObject({ turnComplete: false,
        turns: [{ parts: [{ text: expect.stringContaining('[CONTEXT_RESTORE]') }] }] })
      await client.disconnect()
    } finally { vi.useRealTimers() }
  })

  it('times out a stuck connect and closes its late socket', async () => {
    vi.useFakeTimers()
    try {
      sdk.connectOutcomes.push('hang', 'ok')
      const client = new GeminiLiveClient('test-key')
      const connecting = client.connect(context)
      await vi.advanceTimersByTimeAsync(10_500)
      await connecting
      expect(sdk.configs).toHaveLength(2)
      sdk.lateConnects[0]?.(sdk.sessions[0])
      await vi.advanceTimersByTimeAsync(0)
      expect(sdk.closes).toBe(1)
      await client.disconnect()
    } finally { vi.useRealTimers() }
  })

  it('retries after entering degraded mode and comes back online', async () => {
    vi.useFakeTimers()
    try {
      const client = new GeminiLiveClient('test-key')
      const events: unknown[] = []
      client.onEvent((event) => events.push(event))
      await client.connect(context)
      sdk.connectOutcomes.push('reject', 'reject', 'reject', 'reject', 'reject', 'ok')
      sdk.callbacks?.onmessage({ goAway: {} })
      await vi.advanceTimersByTimeAsync(28_000)
      expect(events).toContainEqual({ type: 'connection', state: 'degraded' })
      expect(events).toContainEqual({ type: 'connection', state: 'connected', resumed: false, restored: true })
      expect(sdk.turns[0]).toMatchObject({ turnComplete: false,
        turns: [{ parts: [{ text: expect.stringContaining('[CONTEXT_RESTORE]') }] }] })
      await client.disconnect()
    } finally { vi.useRealTimers() }
  })

  it('recovers when an app turn receives no server completion', async () => {
    vi.useFakeTimers()
    try {
      const client = new GeminiLiveClient('test-key')
      await client.connect(context)
      client.sendTurn({ tag: 'CHECK', text: '[CHECK] stalled', turnComplete: true })
      await vi.advanceTimersByTimeAsync(30_500)
      expect(sdk.configs).toHaveLength(2)
      expect(sdk.turns[1]).toMatchObject({ turnComplete: false,
        turns: [{ parts: [{ text: expect.stringContaining('[CONTEXT_RESTORE]') }] }] })
      await client.disconnect()
    } finally { vi.useRealTimers() }
  })
})
