import { describe, expect, it } from 'vitest'
import { pickWallets, walletNetwork } from './wallets'

describe('multi-wallet network classification', () => {
  it('uses the connector chain over address shape', () => {
    expect(walletNetwork({ address: '0xabc', chain: 'EVM' })).toBe('tempo')
    expect(walletNetwork({ address: '4Nd1xyz', chain: 'SOL' })).toBe('solana')
  })

  it('recognizes common Solana connectors by name', () => {
    expect(walletNetwork({ address: 'abc', connector: { name: 'Phantom' } })).toBe('solana')
  })

  it('falls back to address prefix when chain metadata is missing', () => {
    expect(walletNetwork({ address: '0xabc' })).toBe('tempo')
    expect(walletNetwork({ address: '4Nd1xyz' })).toBe('solana')
  })

  it('picks one wallet per network so EVM and Solana stay connected together', () => {
    const wallets = [
      { address: '0xaaa', chain: 'EVM' },
      { address: 'Sol111', chain: 'SOL' },
      { address: '0xbbb', chain: 'EVM' },
    ]
    const picked = pickWallets(wallets)
    expect(picked.tempo?.address).toBe('0xaaa')
    expect(picked.solana?.address).toBe('Sol111')
  })
})
