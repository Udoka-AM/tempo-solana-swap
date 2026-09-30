import { describe, expect, it } from 'vitest'
import { solanaUsdcAta } from './solana-account'

describe('Solana USDC recipient accounts', () => {
  it('derives the canonical USDC ATA from the recipient wallet owner', () => {
    expect(solanaUsdcAta('11111111111111111111111111111111').toBase58()).toBe('HJt8Tjdsc9ms9i4WCZEzhzr4oyf3ANcdzXrNdLPFqm3M')
  })
})
