export const TEMPO_CHAIN_ID = 4217
export const SOLANA_CHAIN_ID = 34268394551451

export type Network = 'tempo' | 'solana'
export type AssetId = 'pathUSD' | 'USDC.e' | 'USDC' | 'SOL'

export type Asset = {
  id: AssetId
  network: Network
  address: string
  decimals: number
  label: string
  symbol: string
  bridgeable: boolean
}

// Release scope deliberately stays small: only the canonical settlement assets
// can be selected as an Across input or output. SOL is shown for gas only.
export const ASSETS: readonly Asset[] = [
  { id: 'pathUSD', network: 'tempo', address: '0x20c0000000000000000000000000000000000000', decimals: 6, label: 'pathUSD', symbol: 'pathUSD', bridgeable: true },
  { id: 'USDC.e', network: 'tempo', address: '0x20C000000000000000000000b9537d11c60E8b50', decimals: 6, label: 'USDC.e', symbol: 'USDC.e', bridgeable: true },
  { id: 'USDC', network: 'solana', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, label: 'USD Coin', symbol: 'USDC', bridgeable: true },
  { id: 'SOL', network: 'solana', address: 'So11111111111111111111111111111111111111112', decimals: 9, label: 'Solana', symbol: 'SOL', bridgeable: false },
] as const

export function assetsFor(network: Network) {
  return ASSETS.filter((asset) => asset.network === network)
}

export function findAsset(network: Network, id: AssetId) {
  return ASSETS.find((asset) => asset.network === network && asset.id === id)
}

export function isSupportedPair(originNetwork: Network, input: AssetId, destinationNetwork: Network, output: AssetId) {
  if (originNetwork === destinationNetwork || input === 'SOL' || output === 'SOL') return false
  return originNetwork === 'tempo'
    ? destinationNetwork === 'solana' && output === 'USDC' && (input === 'pathUSD' || input === 'USDC.e')
    : destinationNetwork === 'tempo' && input === 'USDC' && (output === 'pathUSD' || output === 'USDC.e')
}
