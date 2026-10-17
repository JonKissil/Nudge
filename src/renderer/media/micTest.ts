import type { MediaApi } from '../../shared/bridge'
import { MicCapture } from './audio'
import { pcm16Peak } from './pcm16Peak'

/** Probe the same PCM worklet as check-ins without forwarding any audio to main or Gemini. */
export function attachMicTest(api: MediaApi): () => void {
  let running = false
  let active = true
  let probe: MicCapture | undefined
  const unsubscribe = api.onMicTestStart(({ id }) => {
    if (running) {
      api.sendMicTestResult({ id, ok: false, chunks: 0, peak: 0, error: 'A microphone check is already running.' })
      return
    }
    running = true
    let chunks = 0
    let peak = 0
    probe = new MicCapture((pcm16Base64) => {
      chunks += 1
      peak = Math.max(peak, pcm16Peak(pcm16Base64))
    })
    void (async () => {
      try {
        await probe!.setOpen(true)
        await new Promise((resolve) => setTimeout(resolve, 3000))
        if (active) api.sendMicTestResult({ id, ok: chunks > 0, chunks, peak,
          ...(chunks === 0 ? { error: 'No audio chunks arrived from the microphone.' } : {}) })
      } catch {
        if (active) api.sendMicTestResult({ id, ok: false, chunks, peak,
          error: 'Microphone capture could not start. Check macOS permission and restart Nudge.' })
      } finally {
        probe?.close()
        probe = undefined
        running = false
      }
    })()
  })
  return () => { active = false; probe?.close(); unsubscribe() }
}
