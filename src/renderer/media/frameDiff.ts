export interface FrameGateConfig {
  frameMaxFps: number; keyframeMs: number; diffThreshold: number
}

export function grayscale(rgba: Uint8ClampedArray): Uint8Array {
  if (rgba.length % 4 !== 0) throw new Error('Expected RGBA pixels')
  const result = new Uint8Array(rgba.length / 4)
  for (let i = 0; i < result.length; i++) {
    const offset = i * 4
    result[i] = Math.round(0.299 * rgba[offset]! + 0.587 * rgba[offset + 1]! + 0.114 * rgba[offset + 2]!)
  }
  return result
}

export function frameDifference(current: Uint8Array, previous: Uint8Array): number {
  if (current.length !== previous.length || current.length === 0) throw new Error('Expected equal nonempty frames')
  let sum = 0
  for (let i = 0; i < current.length; i++) sum += Math.abs(current[i]! - previous[i]!)
  return sum / (current.length * 255)
}

export function shouldSendFrame(current: Uint8Array, previous: Uint8Array | undefined,
  lastSentAt: number | undefined, now: number, config: FrameGateConfig): boolean {
  if (current.length === 0) return false
  if (lastSentAt !== undefined && now - lastSentAt < 1000 / config.frameMaxFps) return false
  if (!previous || lastSentAt === undefined || current.length !== previous.length) return true
  return now - lastSentAt >= config.keyframeMs || frameDifference(current, previous) > config.diffThreshold
}
