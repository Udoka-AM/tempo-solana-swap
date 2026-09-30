import { describe, expect, it } from 'vitest'
import { isEvmAddress, isSolanaAddress, validateAddressFor } from './addresses'

describe('destination address validation', () => {
  it('accepts well-formed EVM addresses', () => {
    expect(isEvmAddress('0x000000000000000000000000000000000000dEaD')).toBe(true)
    expect(isEvmAddress('0xabc')).toBe(false)
    expect(validateAddressFor('tempo', '0xabc')).toMatch(/valid EVM address/)
  })

  it('accepts well-formed Solana addresses', () => {
    expect(isSolanaAddress('11111111111111111111111111111111')).toBe(true)
    expect(isSolanaAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')).toBe(true)
    expect(isSolanaAddress('0xabc')).toBe(false)
    expect(validateAddressFor('solana', 'nope')).toMatch(/valid Solana address/)
  })

  it('requires a value', () => {
    expect(validateAddressFor('solana', '   ')).toMatch(/Enter a destination/)
  })
})
