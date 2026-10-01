import { Connection, VersionedTransaction } from '@solana/web3.js'
import { BASE_CHAIN_ID, TEMPO_CHAIN_ID } from '../../shared/assets'
import type { AcrossQuote, AcrossTransaction } from './quote'
import { buildSolanaUsdcAtaTransaction, hasSolanaUsdcAta, SOLANA_RPC_URL } from './solana-account'

type EvmWallet = {
  switchNetwork: (chainId: number) => Promise<void>
  connector: { getSigner?: () => Promise<{ sendTransaction: (transaction: { to: `0x${string}`; data?: `0x${string}`; value?: bigint }) => Promise<`0x${string}`> } | undefined> }
}

export type SolanaWallet = {
  address?: string
  connector: { getSigner?: () => Promise<{ signAndSendTransaction?: (transaction: VersionedTransaction) => Promise<{ signature: string } | string> } | undefined> }
}

export type ExecutionUpdate = (stage: 'switching' | 'approving' | 'submitting' | 'submitted', reference?: string) => void

export const EVM_PROXY_CHAIN_ID = BASE_CHAIN_ID

function assertFreshQuote(quote: AcrossQuote) {
  if (quote.quoteExpiryTimestamp === undefined) return
  const expiry = Number(quote.quoteExpiryTimestamp)
  if (Number.isFinite(expiry) && Date.now() >= expiry * 1000) throw new Error('This quote expired. Refresh the route before signing.')
}

function requireEvmTx(tx: AcrossTransaction | undefined) {
  if (!tx?.to || !tx.data || !/^0x[0-9a-fA-F]*$/.test(tx.data)) throw new Error('Across did not return a compatible EVM transaction. Refresh the quote.')
  return { ...tx, data: tx.data as `0x${string}` }
}

export async function executeEvmQuote(wallet: EvmWallet, quote: AcrossQuote, onUpdate: ExecutionUpdate, chainId: number = TEMPO_CHAIN_ID) {
  assertFreshQuote(quote)
  onUpdate('switching')
  await wallet.switchNetwork(chainId)
  const signer = await wallet.connector.getSigner?.()
  if (!signer) throw new Error('The selected wallet cannot sign an EVM transaction.')
  for (const approval of quote.approvalTxns ?? []) {
    const tx = requireEvmTx(approval)
    onUpdate('approving')
    await signer.sendTransaction({ to: tx.to as `0x${string}`, data: tx.data, value: tx.value ? BigInt(tx.value) : undefined })
  }
  const tx = requireEvmTx(quote.swapTx ?? quote.depositTx)
  onUpdate('submitting')
  const hash = await signer.sendTransaction({ to: tx.to as `0x${string}`, data: tx.data, value: tx.value ? BigInt(tx.value) : undefined })
  onUpdate('submitted', hash)
  return hash
}

function decodeBase64Transaction(value: string) {
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
  return VersionedTransaction.deserialize(bytes)
}

export function solanaTransactionData(quote: AcrossQuote) {
  return quote.depositTx?.serializedTransaction
    ?? quote.depositTx?.data
    ?? quote.swapTx?.serializedTransaction
    ?? quote.swapTx?.data
}

export async function executeSolanaQuote(wallet: SolanaWallet, quote: AcrossQuote, onUpdate: ExecutionUpdate) {
  assertFreshQuote(quote)
  const serialized = solanaTransactionData(quote)
  if (!serialized) throw new Error('Across did not return a supported Solana deposit. Refresh the quote.')
  const signer = await wallet.connector.getSigner?.()
  if (!signer?.signAndSendTransaction) throw new Error('The selected wallet cannot sign a Solana transaction.')
  onUpdate('submitting')
  const result = await signer.signAndSendTransaction(decodeBase64Transaction(serialized))
  const signature = typeof result === 'string' ? result : result.signature
  onUpdate('submitted', signature)
  return signature
}

export async function initializeSolanaUsdcAta(wallet: SolanaWallet, owner: string, onUpdate: ExecutionUpdate) {
  if (!wallet.address) throw new Error('Connect the Solana recipient wallet to initialize its USDC account.')
  if (wallet.address !== owner) throw new Error('Connect the Solana wallet that owns the recipient address to initialize USDC.')
  if (await hasSolanaUsdcAta(owner)) return undefined
  const signer = await wallet.connector.getSigner?.()
  if (!signer?.signAndSendTransaction) throw new Error('The selected wallet cannot initialize a Solana token account.')
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed')
  const { transaction, blockhash, lastValidBlockHeight } = await buildSolanaUsdcAtaTransaction(wallet.address, owner, connection)
  onUpdate('submitting')
  const result = await signer.signAndSendTransaction(transaction)
  const signature = typeof result === 'string' ? result : result.signature
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  if (!(await hasSolanaUsdcAta(owner, connection))) throw new Error('The Solana USDC account was not initialized. Try again.')
  onUpdate('submitted', signature)
  return signature
}
