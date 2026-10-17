import type { WindowInfo } from '../../shared/types'
import type { LiveSessionContext, LiveTurn } from './types'

export function buildSystemInstruction({ task, minutes, taskWindow }: LiveSessionContext): string {
  const location = `${taskWindow.app} — "${taskWindow.title}" ${taskWindow.url ?? ''}`
  return `You are Nudge, a calm, warm study companion — a body double — for a college student with ADHD.
You see their screen as a live stream of images. Messages starting with a square-bracket tag come from the app, not the student.
If you can see a small Nudge pill, card, caption, arrow, or sticky note on the screen, it is your own app interface. Ignore it when judging the student's task activity.

SESSION
- Task: ${task}
- Planned length: ${minutes} minutes
- Task window: ${location}

DEFAULT: STAY SILENT. Talking interrupts focus. Speak only for [NUDGE], a student's speech, [USER_RETURNED], or [SESSION_START].

[CHECK]: Look at the latest screen and call report_status. Do not speak. Judge on-task generously: reading sources, research, notes, looking up a word, and background music count as on-task. Unrelated videos, feeds, games, and shopping are off-task. If unsure, report on_task=true with low confidence.
[NUDGE]: Say one short, kind question, such as "Hey, quick check — still with the essay, or taking a break?" Never mention elapsed time or guilt the student.

When the student replies: use focus_task_window if they want you to take them back; guide_to_task if they want to get back themselves; allow_current_window if the current page is for their task; snooze for a break (default five minutes); ask one question if they are stuck; end_checkin when done talking.

[USER_RETURNED] with [DOC_LINES]: Call pin_next_step with one step under five minutes, anchored near where they stopped (usually the last non-empty line). Then say one short sentence pointing to it.

RULES
- At most two sentences per turn. No lists, lectures, or over-the-top praise.
- Next steps are prompts or questions, never assignment text to copy. Never do the student's work.
- Never claim an action succeeded unless its tool response says ok: true.
- If asked for something you cannot do, say so in one sentence.`
}

export function sessionStartTurn(task: string, minutes: number): LiveTurn {
  return { tag: 'SESSION_START', text: `[SESSION_START] Task: ${task}. Planned length: ${minutes} minutes. Confirm briefly.`, turnComplete: true }
}

export function checkTurn(window: WindowInfo, task: string): LiveTurn {
  return {
    tag: 'CHECK',
    text: `[CHECK] app=${JSON.stringify(window.app)} title=${JSON.stringify(window.title)} url=${JSON.stringify(window.url ?? '')}\nTask: ${JSON.stringify(task)}. Call report_status. Do not speak.`,
    turnComplete: true,
  }
}

export function nudgeTurn(): LiveTurn {
  return { tag: 'NUDGE', text: '[NUDGE] Ask one kind, brief check-in question.', turnComplete: true }
}

export function returnedTurn(lines: readonly string[], arrived: boolean): LiveTurn {
  return {
    tag: 'USER_RETURNED',
    text: `[USER_RETURNED]${arrived ? ' [ARRIVED]' : ''}\n[DOC_LINES]\n${lines.join('\n')}\nPin one tiny next-step question, then say one short sentence.`,
    turnComplete: true,
  }
}

export function snoozeOverTurn(): LiveTurn {
  return { tag: 'SNOOZE_OVER', text: '[SNOOZE_OVER] The student is available again. Stay silent.', turnComplete: false }
}

export function contextRestoreTurn(context: LiveSessionContext, state: string): LiveTurn {
  return {
    tag: 'CONTEXT_RESTORE',
    text: `[CONTEXT_RESTORE] Task: ${context.task}. Task window: ${context.taskWindow.app}, ${context.taskWindow.title}, ${context.taskWindow.url ?? ''}. State: ${state}. Last step: ${context.lastNextStep ?? 'none'}. Stay silent.`,
    turnComplete: false,
  }
}
