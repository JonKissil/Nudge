import type { SessionState, WindowInfo } from '../../shared/types'
import { refreshedTaskUrl, savedTaskTab, TASK_URL_REFRESH_MS, type SavedTaskTab } from './taskUrl'

export interface TaskRecoveryPorts {
  getPhase(): SessionState
  readUrl(window: WindowInfo): Promise<string | undefined>
  updateUrl(url: string): Promise<unknown>
  save(task: SavedTaskTab | undefined): Promise<void>
  log(message: string): void
}

/** Read-only background checkpoints; reopening is exclusively an explicit return action. */
export class TaskRecovery {
  private window?: WindowInfo
  private generation = 0
  private busy = false
  private lastError = ''
  private readonly timer: ReturnType<typeof setInterval>

  constructor(private readonly ports: TaskRecoveryPorts) {
    this.timer = setInterval(() => { void this.refresh() }, TASK_URL_REFRESH_MS)
    this.timer.unref()
  }

  start(window: WindowInfo): void {
    this.generation++
    this.window = savedTaskTab(window, Date.now()) ? window : undefined
    this.lastError = ''
    void this.persist(this.window && savedTaskTab(this.window, Date.now()))
  }

  stop(): void {
    this.generation++
    this.window = undefined
    void this.persist(undefined)
  }

  private async persist(task: SavedTaskTab | undefined): Promise<void> {
    try { await this.ports.save(task) }
    catch { this.ports.log('The task URL checkpoint could not be saved. Its address is still available in this session.') }
  }

  private active(): boolean {
    return ['FOCUSED', 'DRIFTING', 'SNOOZED', 'REENTRY'].includes(this.ports.getPhase())
  }

  private async refresh(): Promise<void> {
    if (!this.window || this.busy || !this.active()) return
    const generation = this.generation, locked = this.window
    this.busy = true
    try {
      const candidate = await this.ports.readUrl(locked)
      if (generation !== this.generation || !this.active()) return
      const url = candidate && refreshedTaskUrl(locked, candidate)
      if (!url) return // A closed or inaccessible tab keeps its last checkpoint.
      this.window = { ...locked, url }
      await this.ports.updateUrl(url)
      if (generation !== this.generation || !this.active()) return
      await this.persist(savedTaskTab(this.window, Date.now()))
      this.lastError = ''
    } catch {
      if (generation !== this.generation) return
      const message = 'Could not refresh the task URL. Keeping its last saved address.'
      if (message !== this.lastError) { this.lastError = message; this.ports.log(message) }
    } finally { this.busy = false }
  }

  dispose(): void { this.generation++; this.window = undefined; clearInterval(this.timer) }
}
