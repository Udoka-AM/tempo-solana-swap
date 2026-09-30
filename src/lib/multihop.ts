import { findAsset, type Asset, type AssetId, type Network } from '../../shared/assets'

// User-facing direction. Base is never an endpoint — it is the proxy hop.
export type Direction = 'tempo' | 'solana'

export type Hop = {
  origin: Network
  destination: Network
  input: Asset
  output: Asset
}

// Tempo -> Base USDC -> Solana USDC, or the reverse. Returns undefined when
// the selected assets cannot form the corridor.
export function planHops(direction: Direction, inputId: AssetId, outputId: AssetId): Hop[] | undefined {
  const proxy = findAsset('base', 'USDC')
  if (!proxy) return undefined
  if (direction === 'tempo') {
    const input = findAsset('tempo', inputId)
    const output = findAsset('solana', outputId)
    if (!input || !output) return undefined
    return [
      { origin: 'tempo', destination: 'base', input, output: proxy },
      { origin: 'base', destination: 'solana', input: proxy, output },
    ]
  }
  const input = findAsset('solana', inputId)
  const output = findAsset('tempo', outputId)
  if (!input || !output) return undefined
  return [
    { origin: 'solana', destination: 'base', input, output: proxy },
    { origin: 'base', destination: 'tempo', input: proxy, output },
  ]
}

// Addresses for each hop. The EVM side reuses one address: for Tempo-first
// routes the sender receives the Base proxy funds themselves; for
// Solana-first routes the final EVM destination receives them.
export function hopParties(
  direction: Direction,
  senderAddress: string,
  finalAddress: string,
): [{ depositor: string; recipient: string }, { depositor: string; recipient: string }] {
  if (direction === 'tempo') {
    return [
      { depositor: senderAddress, recipient: senderAddress },
      { depositor: senderAddress, recipient: finalAddress },
    ]
  }
  return [
    { depositor: senderAddress, recipient: finalAddress },
    { depositor: finalAddress, recipient: finalAddress },
  ]
}
