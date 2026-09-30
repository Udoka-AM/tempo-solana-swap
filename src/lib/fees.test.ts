import { describe, expect, it } from 'vitest'
import { feeShares, formatUsd, totalFeeUsd } from './fees'

describe('fee visualization math', () => {
  it('splits shares proportionally by USD weight', () => {
    const shares = feeShares([
      { from: 'A', to: 'B', display: 'x', amountUsd: 3 },
      { from: 'B', to: 'C', display: 'y', amountUsd: 1 },
    ])
    expect(shares[0]).toBeCloseTo(0.75)
    expect(shares[1]).toBeCloseTo(0.25)
  })

  it('falls back to an even split when USD data is missing', () => {
    expect(feeShares([
      { from: 'A', to: 'B', display: 'x' },
      { from: 'B', to: 'C', display: 'y', amountUsd: 1 },
    ])).toEqual([0.5, 0.5])
  })

  it('totals USD only when every leg reports it', () => {
    expect(totalFeeUsd([
      { from: 'A', to: 'B', display: 'x', amountUsd: 0.02 },
      { from: 'B', to: 'C', display: 'y', amountUsd: 0.0001 },
    ])).toBeCloseTo(0.0201)
    expect(totalFeeUsd([{ from: 'A', to: 'B', display: 'x' }])).toBeUndefined()
  })

  it('formats dust without fake precision', () => {
    expect(formatUsd(0.0001)).toBe('<$0.01')
    expect(formatUsd(1.5)).toBe('$1.50')
    expect(formatUsd(undefined)).toBeUndefined()
  })
})
