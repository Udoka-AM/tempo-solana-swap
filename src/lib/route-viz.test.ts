import { describe, expect, it } from 'vitest'
import { isAnimatingPhase, phaseLabel } from './route-viz'

describe('route visualization phases', () => {
  it('labels each phase with origin and destination', () => {
    expect(phaseLabel('loading', 'TEMPO', 'SOLANA')).toMatch(/Fetching live/)
    expect(phaseLabel('submitted', 'TEMPO', 'SOLANA')).toMatch(/delivering/)
  })

  it('animates only while fetching or submitting', () => {
    expect(isAnimatingPhase('loading')).toBe(true)
    expect(isAnimatingPhase('submitting')).toBe(true)
    expect(isAnimatingPhase('ready')).toBe(false)
    expect(isAnimatingPhase('submitted')).toBe(false)
  })
})
