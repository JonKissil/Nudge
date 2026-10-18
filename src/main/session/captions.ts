const SAMPLE_RATE = 24_000
const MIN_CUE_MS = 1_800
const LAST_CUE_MS = 2_800
const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })

/** Keep whole words together, including languages that do not use spaces. */
function cues(text: string): string[] {
  const result: string[] = []
  let cue = '', words = 0
  for (const part of segmenter.segment(text)) {
    if (part.isWordLike && (words >= 7 || cue.length + part.segment.length > 80)) {
      if (cue.trim()) result.push(cue.trim())
      cue = ''; words = 0
    }
    cue += part.segment
    if (part.isWordLike) words++
  }
  if (cue.trim()) result.push(cue.trim())
  return result
}

interface Utterance {
  start: number
  end: number
  text: string
  finished: boolean
}

/** Transcription can arrive ahead of speech. Advance readable cues only as PCM is played. */
export class PlaybackCaptions {
  private received = 0
  private played = 0
  private current?: Utterance
  private readonly queue: Utterance[] = []
  private shown?: { utterance: Utterance; index: number; since: number; playedAt: number }

  begin(): void {
    if (this.current && !this.current.finished) return
    this.current = { start: this.received, end: this.received, text: '', finished: false }
    this.queue.push(this.current)
  }

  audio(samples: number): void {
    if (!this.current) this.begin()
    this.received += samples
    this.current!.end = this.received
  }

  append(text: string): void {
    if (!this.current || (this.current.finished && !this.queue.includes(this.current))) this.begin()
    if (this.queue.includes(this.current!)) this.current!.text = (this.current!.text + text).slice(0, 8_000)
  }

  finish(): void { if (this.current) this.current.finished = true }

  playback(samples: number): void { this.played = Math.max(this.played, Math.min(samples, this.received)) }

  reset(): void {
    this.received = 0; this.played = 0; this.current = undefined
    this.queue.length = 0; this.shown = undefined
  }

  tick(now: number): string {
    const utterance = this.queue[0]
    if (!utterance) return ''
    const parts = cues(utterance.text)
    if (utterance.finished && (utterance.end === utterance.start
      || (!parts.length && this.played >= utterance.end))) {
      this.queue.shift(); this.shown = undefined
      return this.tick(now)
    }
    if (!parts.length || this.played <= utterance.start) return ''
    if (this.shown?.utterance !== utterance) {
      this.shown = { utterance, index: 0, since: now, playedAt: utterance.start }
    }

    const duration = Math.max(1, utterance.end - utterance.start)
    const fraction = Math.min(1, (this.played - utterance.start) / duration)
    const desired = Math.min(parts.length - 1, Math.floor(fraction * parts.length))
    const shown = this.shown
    const playedEnough = (this.played - shown.playedAt) / SAMPLE_RATE * 1_000 >= MIN_CUE_MS
      || (utterance.finished && this.played >= utterance.end)
    if (desired > shown.index && now - shown.since >= MIN_CUE_MS && playedEnough) {
      // Even when generation/playback finishes at once, never skip an unread cue.
      shown.index++; shown.since = now; shown.playedAt = this.played
    } else if (utterance.finished && this.played >= utterance.end
      && shown.index === parts.length - 1 && now - shown.since >= LAST_CUE_MS) {
      this.queue.shift(); this.shown = undefined
      return this.tick(now)
    }
    return parts[shown.index] ?? ''
  }
}
