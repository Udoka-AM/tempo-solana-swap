import { describe, expect, it } from 'vitest'
import { hopParties, planHops } from './multihop'

describe('multihop route planning', () => {
  it('plans Tempo -> Base -> Solana with the selected assets on the ends', () => {
    const hops = planHops('tempo', 'pathUSD', 'USDC')
    expect(hops?.map((hop) => `${hop.origin}>${hop.destination}`)).toEqual(['tempo>base', 'base>solana'])
    expect(hops?.[0].input.id).toBe('pathUSD')
    expect(hops?.[1].output.id).toBe('USDC')
    expect(hops?.[0].output.address).toBe(hops?.[1].input.address)
  })

  it('plans the reverse corridor through the same Base proxy', () => {
    const hops = planHops('solana', 'USDC', 'USDC.e')
    expect(hops?.map((hop) => `${hop.origin}>${hop.destination}`)).toEqual(['solana>base', 'base>tempo'])
  })

  it('rejects unknown assets', () => {
    expect(planHops('tempo', 'SOL' as never, 'USDC')).toBeUndefined()
  })

  it('reuses the EVM address for the proxy hop', () => {
    expect(hopParties('tempo', '0xEVM', 'Sol111')).toEqual([
      { depositor: '0xEVM', recipient: '0xEVM' },
      { depositor: '0xEVM', recipient: 'Sol111' },
    ])
    expect(hopParties('solana', 'Sol111', '0xEVM')).toEqual([
      { depositor: 'Sol111', recipient: '0xEVM' },
      { depositor: '0xEVM', recipient: '0xEVM' },
    ])
  })
})
