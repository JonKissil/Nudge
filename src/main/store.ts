import { readFileSync } from 'node:fs'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AllowListEntry, Theme, WindowInfo } from '../shared/types'
import { addAllowedWindow, StoredStateSchema, type StoredState } from './drift/allowList'
import { SavedTaskTabSchema, type SavedTaskTab } from './session/taskUrl'
import { GRACE_HISTORY_LIMIT, GraceReturnSchema } from '../shared/grace'
import {
  addHabitEvent, emptyHabitMemory, HabitEventSchema, validateHabitProposal,
  type HabitEvent, type HabitMemory, type HabitProposal,
} from '../shared/habits'

/** Saves allowances, one task URL, and bounded numeric timing history; never frames or audio. */
export class AppStore {
  private state: StoredState = { version: 1, allowList: [] }
  private writes: Promise<void> = Promise.resolve()

  constructor(private readonly path: string, onError: (message: string) => void) {
    try { this.state = StoredStateSchema.parse(JSON.parse(readFileSync(path, 'utf8'))) }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        onError('Saved allow-list could not be read; starting with an empty list.')
      }
    }
  }

  get allowList(): readonly AllowListEntry[] { return this.state.allowList }
  get theme(): Theme { return this.state.theme ?? 'minimalist' }
  get quietMode(): boolean { return this.state.quietMode ?? false }

  saveQuietMode(enabled: boolean): Promise<void> {
    return this.update((state) => state.quietMode === enabled ? state : { ...state, quietMode: enabled },
      'Quiet Mode could not be saved. Please try again.')
  }

  saveTheme(theme: Theme): Promise<void> {
    return this.update((state) => state.theme === theme ? state : { ...state, theme },
      'The selected theme could not be saved. Please try again.')
  }

  get graceHistory(): readonly number[] { return this.state.graceHistory ?? [] }
  get adaptiveGrace(): boolean { return this.state.adaptiveGrace ?? true }
  get geminiGrace(): boolean { return this.state.geminiGrace ?? true }
  get habits(): HabitMemory { return this.state.habits ?? emptyHabitMemory() }
  flush(): Promise<void> { return this.writes }

  recordGraceReturn(durationMs: number): Promise<void> {
    const duration = GraceReturnSchema.parse(durationMs)
    return this.update((state) => state.adaptiveGrace === false ? state : ({ ...state,
      graceHistory: [...(state.graceHistory ?? []), duration].slice(-GRACE_HISTORY_LIMIT),
    }), 'Return timing could not be saved. Your current session is unchanged.')
  }

  setAdaptiveGrace(enabled: boolean): Promise<void> {
    return this.update((state) => ({ ...state, adaptiveGrace: enabled }), 'The timing preference could not be saved.')
  }

  resetGraceHistory(): Promise<void> {
    return this.update((state) => ({ ...state, graceHistory: [],
      habits: { revision: (state.habits?.revision ?? 0) + 1, events: [] },
    }), 'Learned timing could not be reset.')
  }

  setGeminiGrace(enabled: boolean): Promise<void> {
    return this.update((state) => ({ ...state, geminiGrace: enabled }), 'The Gemini timing preference could not be saved.')
  }

  async recordHabitEvent(event: HabitEvent, isCurrent: () => boolean = () => true): Promise<boolean> {
    const parsed = HabitEventSchema.parse(event)
    let saved = false
    await this.update((state) => {
      if (!isCurrent() || state.adaptiveGrace === false || state.geminiGrace === false) return state
      saved = true
      return { ...state, habits: addHabitEvent(state.habits ?? emptyHabitMemory(), parsed) }
    }, 'Timing feedback could not be saved.')
    return saved
  }

  async acceptHabitReview(proposal: HabitProposal, revision: number, currentGraceMs: number,
    isCurrent: () => boolean): Promise<boolean> {
    let accepted = false
    await this.update((state) => {
      const memory = state.habits ?? emptyHabitMemory()
      if (!isCurrent() || state.adaptiveGrace === false || state.geminiGrace === false || memory.revision !== revision) return state
      const profile = validateHabitProposal(proposal, memory, currentGraceMs)
      if (!profile) return state
      accepted = true
      return { ...state, habits: { ...memory, profile } }
    }, 'Learned timing could not be saved.')
    return accepted
  }

  allow(window: WindowInfo): Promise<void> {
    return this.update((state) => addAllowedWindow(state, window), 'The allow-list could not be saved. Please try again.')
  }

  saveTaskTab(task: SavedTaskTab | undefined): Promise<void> {
    const parsed = task && SavedTaskTabSchema.parse(task)
    return this.update((state) => {
      const previous = state.lockedTask
      if ((!parsed && !previous) || (parsed && previous && parsed.url === previous.url
        && parsed.bundleId === previous.bundleId && parsed.app === previous.app && parsed.title === previous.title)) return state
      const { lockedTask: _removed, ...rest } = state
      void _removed
      return parsed ? { ...rest, lockedTask: parsed } : rest
    }, 'The task URL could not be saved. Keeping its address in memory.')
  }

  private update(change: (state: StoredState) => StoredState, errorMessage: string): Promise<void> {
    const write = this.writes.then(async () => {
      const next = change(this.state)
      if (next === this.state) return
      await mkdir(dirname(this.path), { recursive: true })
      const temporary = `${this.path}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 })
        await rename(temporary, this.path)
      } catch {
        await unlink(temporary).catch(() => {})
        throw new Error(errorMessage)
      }
      this.state = next
    })
    this.writes = write.catch(() => {})
    return write
  }
}
