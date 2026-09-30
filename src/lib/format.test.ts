import { describe, expect, it } from 'vitest'
import { fromAtomicAmount, toAtomicAmount } from './format'

describe('token amount helpers', () => {
  it('encodes six-decimal stablecoin amounts without floating point arithmetic', () => {
    expect(toAtomicAmount('12.345678', 6)).toBe(12345678n)
    expect(toAtomicAmount('12.3456789', 6)).toBe(12345678n)
  })
  it('renders an atomic stablecoin balance', () => {
    expect(fromAtomicAmount('1500000', 6)).toBe('1.5')
  })
})
