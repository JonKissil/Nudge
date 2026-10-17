import { describe, expect, it } from 'vitest'
import { menuBarState } from '../src/main/menuBarState'
import { SessionStateSchema } from '../src/shared/types'

describe('menu-bar session indicator', () => {
  it.each(SessionStateSchema.options)('reflects the real %s state', (state) => {
    const view = menuBarState(state, 'connected')
    const inactive = ['IDLE', 'SETUP', 'PAUSED', 'ENDED'].includes(state)
    expect(view.illuminated).toBe(!inactive)
    expect(view.canPause).toBe(!['IDLE', 'SETUP', 'ENDED'].includes(state))
    expect(view.canEnd).toBe(!['IDLE', 'ENDED'].includes(state))
    expect(view.paused).toBe(state === 'PAUSED')
    expect(view.status.length).toBeGreaterThan(0)
  })

  it('stays lit during snooze and offline operation, without implying a connection', () => {
    expect(menuBarState('SNOOZED', 'connected').status).toBe('Snoozed')
    expect(menuBarState('FOCUSED', 'degraded')).toMatchObject({
      illuminated: true, status: 'Session active · Offline mode',
    })
    expect(menuBarState('FOCUSED', 'reconnecting').illuminated).toBe(true)
    expect(menuBarState('IDLE', 'connected').illuminated).toBe(false)
    expect(menuBarState('PAUSED', 'degraded').illuminated).toBe(false)
  })
})
