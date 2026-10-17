import { z } from 'zod'

export const SessionStateSchema = z.enum([
  'IDLE', 'SETUP', 'FOCUSED', 'DRIFTING', 'NUDGING', 'CHECKIN',
  'RETURNING', 'REENTRY', 'SNOOZED', 'PAUSED', 'ENDED',
])
export type SessionState = z.infer<typeof SessionStateSchema>
export const ConnStateSchema = z.enum(['disconnected', 'connecting', 'connected', 'reconnecting', 'degraded'])
export type ConnState = z.infer<typeof ConnStateSchema>
export const RuleVerdictSchema = z.enum(['on', 'off', 'ask', 'ignore'])
export type RuleVerdict = z.infer<typeof RuleVerdictSchema>

// OS window bounds use display points. Overlay boxes use normalized display coordinates.
export const WindowBoundsSchema = z.strictObject({
  x: z.number().finite(), y: z.number().finite(),
  width: z.number().positive(), height: z.number().positive(),
})
const unit = z.number().min(0).max(1)
export const NormalizedBoxSchema = z.strictObject({ x: unit, y: unit, w: unit, h: unit })
export const WindowInfoSchema = z.strictObject({
  app: z.string().min(1), bundleId: z.string(), title: z.string(),
  url: z.url().optional(), bounds: WindowBoundsSchema,
})
export type WindowInfo = z.infer<typeof WindowInfoSchema>
export const AllowListEntrySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('url-prefix'), value: z.url() }),
  z.strictObject({ kind: z.literal('bundle'), value: z.string().min(1) }),
])
export type AllowListEntry = z.infer<typeof AllowListEntrySchema>
export const StatusSchema = z.strictObject({
  on_task: z.boolean(),
  activity: z.string().trim().min(1).refine((text) => text.split(/\s+/u).length <= 8, 'Use at most eight words'),
  confidence: unit,
})
export type Status = z.infer<typeof StatusSchema>
export const SettingsSchema = z.strictObject({ demoMode: z.boolean(), showHud: z.boolean() })
export type Settings = z.infer<typeof SettingsSchema>
export const HudStatsSchema = z.strictObject({
  framesPerMinute: z.number().nonnegative(),
  resumptionHandleAgeMs: z.number().nonnegative().nullable(),
  ruleVerdict: RuleVerdictSchema.optional(),
  currentWindow: WindowInfoSchema.optional(),
  transitions: z.array(z.strictObject({
    from: SessionStateSchema, to: SessionStateSchema, at: z.number().nonnegative(),
  })).max(10),
  logs: z.array(z.string()).max(50),
})
export type HudStats = z.infer<typeof HudStatsSchema>
export const PillStateSchema = z.strictObject({
  state: SessionStateSchema, offline: z.boolean(), snoozeUntil: z.number().nonnegative().optional(),
})
export type PillState = z.infer<typeof PillStateSchema>
export const NudgeViewSchema = z.strictObject({ text: z.string().min(1) })
export type NudgeView = z.infer<typeof NudgeViewSchema>
export const ArrowViewSchema = z.strictObject({ x: unit, y: unit, label: z.string().min(1) })
export type ArrowView = z.infer<typeof ArrowViewSchema>
export const NoteViewSchema = z.strictObject({
  id: z.string().min(1), text: z.string().min(1).max(120),
  anchor: NormalizedBoxSchema, expiresAt: z.number().nonnegative(),
})
export type NoteView = z.infer<typeof NoteViewSchema>
export const OverlayStateSchema = z.strictObject({
  pill: PillStateSchema, nudge: NudgeViewSchema.optional(), arrow: ArrowViewSchema.optional(),
  notes: z.array(NoteViewSchema), caption: z.string().optional(),
})
export type OverlayState = z.infer<typeof OverlayStateSchema>
export const OverlayActionSchema = z.strictObject({
  kind: z.enum(['take-me-back', 'snooze', 'allow', 'dismiss-note', 'pause', 'resume']),
  id: z.string().min(1).optional(),
}).refine((value) => value.kind !== 'dismiss-note' || value.id !== undefined, 'A note id is required')
export type OverlayAction = z.infer<typeof OverlayActionSchema>
export const SessionStartSchema = z.strictObject({
  task: z.string().trim().min(1).max(1000), minutes: z.number().int().min(1).max(240),
})
export type SessionStart = z.infer<typeof SessionStartSchema>
export const SessionSnapshotSchema = z.strictObject({
  state: SessionStateSchema, taskWindow: WindowInfoSchema.optional(), lastStatus: StatusSchema.optional(),
  conn: ConnStateSchema, stats: HudStatsSchema, settings: SettingsSchema,
  task: z.string(), minutes: z.number().int().min(1).max(240),
})
export type SessionSnapshot = z.infer<typeof SessionSnapshotSchema>
export const ActionResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({ ok: z.literal(false), error: z.string() }),
])
export type ActionResult = z.infer<typeof ActionResultSchema>
