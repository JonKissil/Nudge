import { describe, expect, it } from 'vitest'
import type { LiveEvent, LiveSessionContext } from '../src/main/gemini/types'
import { FakeLiveClient } from './fakes/FakeLiveClient'

const context: LiveSessionContext = {
  task: 'History essay', minutes: 30, language: 'en',
  taskWindow: {
    app: 'Google Chrome', bundleId: 'com.google.Chrome', title: 'History essay - Google Docs',
    url: 'https://docs.google.com/document/d/doc-123/edit',
    bounds: { x: 0, y: 0, width: 1280, height: 800 },
  },
}

describe('FakeLiveClient', () => {
  it('records outbound turns, media, tool responses and connection lifecycle', async () => {
    const client = new FakeLiveClient()
    const events: LiveEvent[] = []
    client.onEvent((event) => events.push(event))
    await client.connect(context)
    client.sendTurn({ tag: 'SESSION_START', text: '[SESSION_START] History essay', turnComplete: true })
    client.sendFrame('anBlZw==')
    client.sendAudio('cGNt')
    client.endAudioStream()
    client.sendToolResponse({ id: 'call-1', name: 'report_status', response: { ok: true }, scheduling: 'silent' })
    await client.disconnect()

    expect(client.connections).toEqual([context])
    expect(client.turns).toHaveLength(1)
    expect(client.frames).toEqual(['anBlZw=='])
    expect(client.audioChunks).toEqual(['cGNt'])
    expect(client.audioStreamEnds).toBe(1)
    expect(client.toolResponses[0]?.id).toBe('call-1')
    expect(client.disconnects).toBe(1)
    expect(events.map((event) => event.type)).toEqual(['connection', 'connection'])
  })

  it('plays scripted tool calls, audio, captions and interruptions to subscribers', () => {
    const client = new FakeLiveClient()
    const events: LiveEvent[] = []
    const unsubscribe = client.onEvent((event) => events.push(event))
    client.script([
      { type: 'tool-call', call: { id: 'call-2', name: 'focus_task_window', args: {} } },
      { type: 'audio', pcm24Base64: 'cGNt' },
      { type: 'transcription', text: 'Back to the essay?' },
      { type: 'interrupted' },
    ])
    unsubscribe()
    client.emit({ type: 'generation-complete' })

    expect(events.map((event) => event.type)).toEqual([
      'tool-call', 'audio', 'transcription', 'interrupted',
    ])
    expect(events[0]).toMatchObject({ call: { id: 'call-2', name: 'focus_task_window' } })
  })
})
