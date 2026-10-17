export const DEFAULTS = {
  tickMs: 10_000, graceMs: 90_000, offTaskConfidence: 0.6, checkTimeoutMs: 10_000,
  checkinSilenceMs: 20_000, silentSnoozeMs: 120_000, returnTimeoutMs: 60_000,
  maxNudgesPer10Min: 3, snoozeDefaultMin: 5,
  frameMaxFps: 1, keyframeMs: 5_000, diffThreshold: 0.02,
  frameWidth: 1280, jpegQuality: 0.7,
} as const

export const DEMO = { ...DEFAULTS, tickMs: 4_000, graceMs: 15_000, checkinSilenceMs: 12_000 } as const
export const DEMO_TASK = 'History essay: causes of the French Revolution'
export const HARD_BLOCKLIST = ['tiktok.com', 'instagram.com', 'reddit.com', 'x.com', 'netflix.com'] as const
