import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GeminiLiveClient } from '../src/main/gemini/liveClient'
import type { LiveSessionContext } from '../src/main/gemini/types'

const sdk = vi.hoisted(() => ({
  callbacks: undefined as undefined | { onmessage: (message: unknown) => void },
  config: undefined as unknown,
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
      sdk.config = config
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
  sdk.config = undefined
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
      outputAudioTranscription: {},
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
})
