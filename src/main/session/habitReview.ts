import { randomUUID } from 'node:crypto'
import type { HabitProposal } from '../../shared/habits'
import type { LiveTurn } from '../gemini/types'
import { habitReviewTurn } from '../gemini/prompts'
import type { AppStore } from '../store'

interface Review { id: string; revision: number; graceMs: number; startedAt: number }

/** At most one optional review per session; never queue one ahead of critical Live turns. */
export class HabitReviewer {
  private pending?: Review
  private attempted = false
  private startedAt = 0

  constructor(private readonly ports: {
    store: AppStore
    eligible(): boolean
    trySend(turn: LiveTurn): boolean
    saved(): void
  }, private readonly clock: () => number = Date.now) {}

  startSession(): void { this.pending = undefined; this.attempted = false; this.startedAt = this.clock() }
  cancel(): void { this.pending = undefined }

  consider(graceMs: number): void {
    if (!this.ports.eligible()) { this.cancel(); return }
    if (this.attempted || this.clock() - this.startedAt < 30_000) return
    const memory = this.ports.store.habits
    if (memory.events.length < 5 || (memory.profile && memory.revision - memory.profile.reviewedRevision < 3)) return
    const review = { id: randomUUID(), revision: memory.revision, graceMs, startedAt: this.clock() }
    this.pending = review
    if (this.ports.trySend(habitReviewTurn(review.id, memory, graceMs))) this.attempted = true
    else this.pending = undefined
  }

  async propose(proposal: HabitProposal): Promise<Record<string, unknown>> {
    const pending = this.pending
    const current = (): boolean => this.pending === pending && this.ports.eligible()
    if (!pending || proposal.review_id !== pending.id || !current() || this.clock() - pending.startedAt > 10_000) {
      return { ok: false, error: 'This habit review is no longer current.' }
    }
    try {
      const accepted = await this.ports.store.acceptHabitReview(proposal, pending.revision, pending.graceMs, current)
      if (accepted) this.ports.saved()
      return accepted ? { ok: true, applies: 'next-session' }
        : { ok: false, error: 'The evidence changed or did not support this recommendation.' }
    } finally { if (this.pending === pending) this.pending = undefined }
  }
}
