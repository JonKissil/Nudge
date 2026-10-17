import { z } from 'zod'
import { SessionStartSchema, StatusSchema } from '../../shared/types'
import type { SessionStart } from '../../shared/types'
import type { LiveToolCall, LiveToolResponse } from './types'

const empty = z.strictObject({})
const pinArgs = z.strictObject({
  text: z.string().trim().min(1).max(120),
  line_id: z.union([z.literal('none'), z.string().regex(/^L[1-9]\d*$/u)]),
})
const snoozeArgs = z.strictObject({ minutes: z.number().int().min(1).max(30).default(5) })
const allowArgs = z.strictObject({ reason: z.string().trim().min(1).max(200) })
const statusArgs = StatusSchema.extend({ check_id: z.string().regex(/^check-[1-9]\d*$/u) })

export interface ToolHandlers {
  reportStatus(args: z.infer<typeof statusArgs>): Promise<Record<string, unknown>>
  reportStatusFailed?(checkId: string): Promise<void>
  focusTaskWindow(): Promise<Record<string, unknown>>
  guideToTask(): Promise<Record<string, unknown>>
  pinNextStep(args: z.infer<typeof pinArgs>): Promise<Record<string, unknown>>
  snooze(args: z.infer<typeof snoozeArgs>): Promise<Record<string, unknown>>
  allowCurrentWindow(args: z.infer<typeof allowArgs>): Promise<Record<string, unknown>>
  endCheckin(): Promise<Record<string, unknown>>
  setTask(args: SessionStart): Promise<Record<string, unknown>>
}

// JSON Schema is for the model; zod remains authoritative at the tool boundary.
export const TOOL_DECLARATIONS = [
  { name: 'report_status', description: 'Silently report whether the current screen relates to the study task.', behavior: 'NON_BLOCKING', parametersJsonSchema: {
    type: 'object', properties: {
      check_id: { type: 'string', description: 'Copy check_id from the current CHECK message exactly' },
      on_task: { type: 'boolean' }, activity: { type: 'string', description: 'At most eight words' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    }, required: ['check_id', 'on_task', 'activity', 'confidence'], additionalProperties: false,
  } },
  { name: 'focus_task_window', description: 'Take the student back to the locked task window or tab.', behavior: 'NON_BLOCKING' },
  { name: 'guide_to_task', description: 'Show the student where to click to return to the task.', behavior: 'NON_BLOCKING' },
  { name: 'pin_next_step', description: 'Pin one small question or prompt near a document line.', behavior: 'NON_BLOCKING', parametersJsonSchema: {
    type: 'object', properties: {
      text: { type: 'string', maxLength: 120, description: 'A prompt or question, never answer text to copy' },
      line_id: { type: 'string', description: 'L1, L2, etc., or none' },
    }, required: ['text', 'line_id'], additionalProperties: false,
  } },
  { name: 'snooze', description: 'Give the student a break from drift checks.', behavior: 'NON_BLOCKING', parametersJsonSchema: {
    type: 'object', properties: { minutes: { type: 'integer', minimum: 1, maximum: 30, default: 5 } }, additionalProperties: false,
  } },
  { name: 'allow_current_window', description: 'Mark this page or app as part of the task.', behavior: 'NON_BLOCKING', parametersJsonSchema: {
    type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'], additionalProperties: false,
  } },
  { name: 'end_checkin', description: 'Close the microphone after the student is done talking.', behavior: 'NON_BLOCKING' },
  { name: 'set_task', description: 'Set the study task and planned duration during setup.', behavior: 'NON_BLOCKING', parametersJsonSchema: {
    type: 'object', properties: { task: { type: 'string' }, minutes: { type: 'integer', minimum: 1, maximum: 240 } },
    required: ['task', 'minutes'], additionalProperties: false,
  } },
] as const

export async function runToolCall(call: LiveToolCall, handlers: ToolHandlers): Promise<LiveToolResponse> {
  const scheduling: LiveToolResponse['scheduling'] =
    call.name === 'report_status' || call.name === 'end_checkin' ? 'silent' : 'when-idle'
  let response: Record<string, unknown>
  try {
    switch (call.name) {
      case 'report_status': response = await handlers.reportStatus(statusArgs.parse(call.args)); break
      case 'focus_task_window': empty.parse(call.args); response = await handlers.focusTaskWindow(); break
      case 'guide_to_task': empty.parse(call.args); response = await handlers.guideToTask(); break
      case 'pin_next_step': response = await handlers.pinNextStep(pinArgs.parse(call.args)); break
      case 'snooze': response = await handlers.snooze(snoozeArgs.parse(call.args)); break
      case 'allow_current_window': response = await handlers.allowCurrentWindow(allowArgs.parse(call.args)); break
      case 'end_checkin': empty.parse(call.args); response = await handlers.endCheckin(); break
      case 'set_task': response = await handlers.setTask(SessionStartSchema.parse(call.args)); break
      default: response = { ok: false, error: `Unknown tool: ${call.name}` }
    }
    if (typeof response.ok !== 'boolean') response = { ok: false, error: 'Tool handler returned no result.' }
  } catch (error) {
    response = {
      ok: false,
      error: error instanceof z.ZodError ? 'Invalid tool arguments.' : 'The action could not be completed.',
    }
  }
  if (call.name === 'report_status' && response.ok === false) {
    // Invalid arguments must not leave the app waiting forever for this check.
    const checkId = typeof call.args === 'object' && call.args !== null && 'check_id' in call.args
      && typeof call.args.check_id === 'string' ? call.args.check_id : undefined
    try { if (checkId) await handlers.reportStatusFailed?.(checkId) }
    catch { /* Keep the original tool error and always respond to the model. */ }
  }
  return { id: call.id, name: call.name, response, scheduling }
}
