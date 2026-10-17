import { readFileSync } from 'node:fs'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AllowListEntry, Theme, WindowInfo } from '../shared/types'
import { addAllowedWindow, StoredStateSchema, type StoredState } from './drift/allowList'
import { SavedTaskTabSchema, type SavedTaskTab } from './session/taskUrl'

/** Saves allowances and one current task URL checkpoint; never frames, audio, or history. */
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

  saveTheme(theme: Theme): Promise<void> {
    return this.update((state) => state.theme === theme ? state : { ...state, theme },
      'The selected theme could not be saved. Please try again.')
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
