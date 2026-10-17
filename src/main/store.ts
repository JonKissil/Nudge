import { readFileSync } from 'node:fs'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AllowListEntry, WindowInfo } from '../shared/types'
import { addAllowedWindow, StoredStateSchema, type StoredState } from './drift/allowList'

/** Only the allow-list is persisted; frames, audio, and study-session history never are. */
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

  allow(window: WindowInfo): Promise<void> {
    const write = this.writes.then(async () => {
      const next = addAllowedWindow(this.state, window)
      if (next === this.state) return
      await mkdir(dirname(this.path), { recursive: true })
      const temporary = `${this.path}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 })
        await rename(temporary, this.path)
      } catch {
        await unlink(temporary).catch(() => {})
        throw new Error('The allow-list could not be saved. Please try again.')
      }
      this.state = next
    })
    this.writes = write.catch(() => {})
    return write
  }
}
