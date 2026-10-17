import type { LiveToolResponse, LiveTurn } from './types'

const MAX_TURNS = 16
const MAX_RESPONSES = 32
const TURN_MAX_AGE_MS = 30_000

interface QueuedTurn { turn: LiveTurn; at: number }
interface QueuedResponse { response: LiveToolResponse; sessionEpoch: number }

/** Only current, bounded work survives a transport outage. */
export class LiveQueue {
  private turns: QueuedTurn[] = []
  private responses: QueuedResponse[] = []

  addTurn(turn: LiveTurn, now = Date.now()): void {
    this.expire(now)
    if (turn.tag === 'CHECK') this.turns = this.turns.filter((item) => item.turn.tag !== 'CHECK')
    this.turns.push({ turn, at: now })
    if (this.turns.length > MAX_TURNS) this.turns.shift()
  }

  firstTurn(now = Date.now()): LiveTurn | undefined {
    this.expire(now)
    return this.turns[0]?.turn
  }

  shiftTurn(): void { this.turns.shift() }

  addResponse(response: LiveToolResponse, sessionEpoch: number): void {
    this.responses.push({ response, sessionEpoch })
    if (this.responses.length > MAX_RESPONSES) this.responses.shift()
  }

  firstResponse(sessionEpoch: number): LiveToolResponse | undefined {
    while (this.responses.length && this.responses[0]?.sessionEpoch !== sessionEpoch) this.responses.shift()
    return this.responses[0]?.response
  }

  shiftResponse(): void { this.responses.shift() }

  /** A new server session cannot accept replies to calls from the previous one. */
  prepareFresh(state: string | undefined, now = Date.now()): void {
    this.responses = []
    this.expire(now)
    this.turns = this.turns.filter(({ turn }) =>
      (turn.tag === 'NUDGE' && (state === 'NUDGING' || state === 'CHECKIN'))
      || (turn.tag === 'USER_RETURNED' && state === 'REENTRY'))
  }

  clear(): void { this.turns = []; this.responses = [] }

  private expire(now: number): void {
    this.turns = this.turns.filter((item) => now - item.at <= TURN_MAX_AGE_MS)
  }
}
