import { describe, expect, it } from 'vitest'
import { formatBalance, sumTokenAmounts } from './balances'

describe('balance helpers', () => {
  it('sums parsed token amounts without floating point math', () => {
    expect(sumTokenAmounts(['1000000', 500000n, '0'])).toBe(1500000n)
  })

  it('formats six-decimal balances compactly', () => {
    expect(formatBalance(1500000n, 6)).toBe('1.5')
    expect(formatBalance(0n, 6)).toBe('0')
    expect(formatBalance(undefined, 6)).toBeUndefined()
  })
})
