import { describe, expect, it } from 'vitest'
import { PlaybackCaptions } from '../src/main/session/captions'

const sentence = 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen.'

describe('captions driven by speaker playback', () => {
  it('buffers early transcription and never skips unread cues when all audio finishes', () => {
    const captions = new PlaybackCaptions()
    captions.begin(); captions.audio(6 * 24_000); captions.append(sentence); captions.finish()
    expect(captions.tick(0)).toBe('')
    captions.playback(100)
    expect(captions.tick(100)).toBe('One two three four five six seven')
    captions.playback(6 * 24_000)
    expect(captions.tick(200)).toBe('One two three four five six seven')
    expect(captions.tick(1_900)).toBe('eight nine ten eleven twelve thirteen fourteen')
    expect(captions.tick(3_699)).toBe('eight nine ten eleven twelve thirteen fourteen')
    expect(captions.tick(3_700)).toBe('fifteen sixteen.')
    expect(captions.tick(6_499)).toBe('fifteen sixteen.')
    expect(captions.tick(6_500)).toBe('')
  })

  it('does not run ahead when playback stalls, even if the model has finished generating', () => {
    const captions = new PlaybackCaptions()
    captions.audio(8 * 24_000); captions.append(sentence); captions.finish()
    captions.playback(24_000)
    const first = captions.tick(0)
    expect(captions.tick(60_000)).toBe(first)
    captions.playback(4 * 24_000)
    expect(captions.tick(60_100)).toBe('eight nine ten eleven twelve thirteen fourteen')
  })

  it('keeps incoming fragments together instead of replacing them with the final fragment', () => {
    const captions = new PlaybackCaptions()
    captions.append('Back to the '); captions.begin(); captions.audio(48_000)
    captions.playback(1_000)
    expect(captions.tick(0)).toBe('Back to the')
    captions.append('essay.'); captions.finish()
    expect(captions.tick(100)).toBe('Back to the essay.')
  })

  it('waits for a queued utterance to reach the speaker and clears the previous one', () => {
    const captions = new PlaybackCaptions()
    captions.begin(); captions.audio(48_000); captions.append('First spoken sentence.'); captions.finish()
    captions.begin(); captions.audio(48_000); captions.append('Second spoken sentence.'); captions.finish()
    captions.playback(48_000)
    expect(captions.tick(0)).toBe('First spoken sentence.')
    expect(captions.tick(2_800)).toBe('')
    captions.playback(48_100)
    expect(captions.tick(2_900)).toBe('Second spoken sentence.')
  })

  it('accepts a late transcription while its audio is still buffered', () => {
    const captions = new PlaybackCaptions()
    captions.begin(); captions.audio(48_000); captions.finish()
    expect(captions.tick(0)).toBe('')
    captions.append('A late caption.'); captions.playback(1_000)
    expect(captions.tick(100)).toBe('A late caption.')
  })

  it('clears text and timing on interruption and leaves the next utterance independent', () => {
    const captions = new PlaybackCaptions()
    captions.audio(48_000); captions.append('Old caption.'); captions.playback(1_000)
    expect(captions.tick(0)).toBe('Old caption.')
    captions.reset()
    captions.playback(90_000)
    expect(captions.tick(100)).toBe('')
    captions.begin(); captions.audio(24_000); captions.append('New caption.')
    expect(captions.tick(200)).toBe('')
    captions.playback(100)
    expect(captions.tick(300)).toBe('New caption.')
  })

  it('segments Japanese captions without requiring spaces', () => {
    const captions = new PlaybackCaptions()
    const text = '今から歴史の課題に戻って、次の小さな一歩について一緒に考えてみましょう。'
    captions.audio(8 * 24_000); captions.append(text); captions.playback(1_000)
    const first = captions.tick(0)
    expect(first.length).toBeGreaterThan(0)
    expect(first.length).toBeLessThan(text.length)
    expect(text.startsWith(first)).toBe(true)
  })

  it('retains the next turn’s first text fragment when it arrives before audio', () => {
    const captions = new PlaybackCaptions()
    captions.audio(24_000); captions.append('First.'); captions.finish(); captions.playback(24_000)
    expect(captions.tick(0)).toBe('First.')
    expect(captions.tick(2_800)).toBe('')
    captions.append('Next '); captions.begin(); captions.audio(24_000); captions.append('sentence.')
    captions.playback(25_000)
    expect(captions.tick(3_000)).toBe('Next sentence.')
  })
})
