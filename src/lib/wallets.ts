import type { Network } from '../../shared/assets'

// Minimal structural view of a Dynamic user wallet. `chain` is the reliable
// discriminator ('EVM' for EVM-compatible wallets such as Arcana, MetaMask,
// Base Account; 'SOL' for Solana wallets such as Phantom, Solflare).
// Address prefix is only a fallback for connectors that omit it.
export type ConnectedWalletLike = {
  address: string
  chain?: string
  network?: string | number
  blockchain?: string
  connector?: { name?: string }
}

export function walletNetwork(wallet: ConnectedWalletLike): Network {
  const hints = [wallet.chain, wallet.blockchain, typeof wallet.network === 'string' ? wallet.network : undefined]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
  if (hints.some((hint) => hint.includes('sol') || hint.includes('svm'))) return 'solana'
  if (hints.some((hint) => hint.includes('evm') || hint.includes('eth') || hint.includes('tempo'))) return 'tempo'
  const connectorName = wallet.connector?.name?.toLowerCase() ?? ''
  if (/phantom|solflare|backpack|solana/.test(connectorName)) return 'solana'
  return wallet.address.startsWith('0x') ? 'tempo' : 'solana'
}

export function pickWallets<T extends ConnectedWalletLike>(wallets: readonly T[]) {
  let tempo: T | undefined
  let solana: T | undefined
  for (const wallet of wallets) {
    if (walletNetwork(wallet) === 'tempo' && !tempo) tempo = wallet
    else if (!solana) solana = wallet
  }
  return { tempo, solana }
}
