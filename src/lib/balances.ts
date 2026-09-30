import { Connection, PublicKey } from '@solana/web3.js'
import { createPublicClient, erc20Abi, formatUnits, http } from 'viem'
import { ASSETS } from '../../shared/assets'

export const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com'
// Public Tempo RPC confirmed via Across /swap/chains metadata
// (publicRpcUrl for chain 4217). Overridable with VITE_TEMPO_RPC_URL.
export const TEMPO_RPC_URL =
  (import.meta.env.VITE_TEMPO_RPC_URL as string | undefined) || 'https://rpc.tempo.xyz'

export function solanaUsdcMint() {
  return ASSETS.find((asset) => asset.network === 'solana' && asset.id === 'USDC')!.address
}

export function tempoTokens() {
  return ASSETS.filter((asset) => asset.network === 'tempo' && asset.bridgeable)
}

// Pure helper: sum raw token amounts from parsed token accounts.
export function sumTokenAmounts(amounts: Array<string | bigint>): bigint {
  return amounts.reduce<bigint>((total, amount) => total + BigInt(amount), 0n)
}

export function formatBalance(raw: bigint | undefined, decimals: number, maxDecimals = 4) {
  if (raw === undefined) return undefined
  const full = formatUnits(raw, decimals)
  const [whole = '0', fraction = ''] = full.split('.')
  if (!fraction) return whole
  return `${whole}.${fraction.slice(0, maxDecimals)}`.replace(/\.$/, '')
}

export async function getSolanaSplBalance(owner: string, mint: string, connection = new Connection(SOLANA_RPC_URL, 'confirmed')) {
  const { value } = await connection.getParsedTokenAccountsByOwner(new PublicKey(owner), { mint: new PublicKey(mint) })
  const amounts = value.map((account) => {
    const info = account.account.data as { parsed?: { info?: { tokenAmount?: { amount?: string } } } }
    return info.parsed?.info?.tokenAmount?.amount ?? '0'
  })
  return sumTokenAmounts(amounts)
}

export async function getSolanaNativeBalance(owner: string, connection = new Connection(SOLANA_RPC_URL, 'confirmed')) {
  return BigInt(await connection.getBalance(new PublicKey(owner)))
}

export async function getEvmErc20Balance(rpcUrl: string, token: `0x${string}`, owner: `0x${string}`) {
  const client = createPublicClient({ transport: http(rpcUrl) })
  return client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner] })
}

export type BalanceState = {
  assetId: string
  network: 'tempo' | 'solana'
  symbol: string
  raw?: bigint
  display?: string
  unavailable?: string
}

export async function loadBalances(addresses: { tempo?: string; solana?: string }): Promise<BalanceState[]> {
  const rows: BalanceState[] = []
  const tempoOwner = addresses.tempo
  for (const token of tempoTokens()) {
    if (!tempoOwner) {
      rows.push({ assetId: token.id, network: 'tempo', symbol: token.symbol })
      continue
    }
    try {
      const raw = await getEvmErc20Balance(TEMPO_RPC_URL, token.address as `0x${string}`, tempoOwner as `0x${string}`)
      rows.push({ assetId: token.id, network: 'tempo', symbol: token.symbol, raw, display: formatBalance(raw, token.decimals) ?? '0' })
    } catch {
      rows.push({ assetId: token.id, network: 'tempo', symbol: token.symbol, unavailable: 'Balance lookup failed.' })
    }
  }
  const solanaOwner = addresses.solana
  if (!solanaOwner) {
    rows.push({ assetId: 'USDC', network: 'solana', symbol: 'USDC' })
  } else {
    try {
      const raw = await getSolanaSplBalance(solanaOwner, solanaUsdcMint())
      rows.push({ assetId: 'USDC', network: 'solana', symbol: 'USDC', raw, display: formatBalance(raw, 6) ?? '0' })
    } catch {
      rows.push({ assetId: 'USDC', network: 'solana', symbol: 'USDC', unavailable: 'Balance lookup failed.' })
    }
  }
  return rows
}
