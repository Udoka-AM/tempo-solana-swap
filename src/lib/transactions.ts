import { VersionedTransaction } from '@solana/web3.js'
import type { AcrossQuote, AcrossTransaction } from './quote'

type EvmWallet = {
  switchNetwork: (chainId: number) => Promise<void>
  connector: { getSigner?: () => Promise<{ sendTransaction: (transaction: { to: `0x${string}`; data?: `0x${string}`; value?: bigint }) => Promise<`0x${string}`> } | undefined> }
}

type SolanaWallet = {
  connector: { getSigner?: () => Promise<{ signAndSendTransaction?: (transaction: VersionedTransaction) => Promise<{ signature: string } | string> } | undefined> }
}

export type ExecutionUpdate = (stage: 'switching' | 'approving' | 'submitting' | 'submitted', reference?: string) => void

function requireEvmTx(tx: AcrossTransaction | undefined) {
  if (!tx?.to || !tx.data) throw new Error('Across did not return a compatible EVM transaction. Refresh the quote.')
  return tx
}

export async function executeEvmQuote(wallet: EvmWallet, quote: AcrossQuote, onUpdate: ExecutionUpdate) {
  onUpdate('switching')
  await wallet.switchNetwork(4217)
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

export async function executeSolanaQuote(wallet: SolanaWallet, quote: AcrossQuote, onUpdate: ExecutionUpdate) {
  const serialized = quote.depositTx?.serializedTransaction ?? quote.swapTx?.serializedTransaction
  if (!serialized) throw new Error('Across did not return a supported Solana deposit. Refresh the quote.')
  const signer = await wallet.connector.getSigner?.()
  if (!signer?.signAndSendTransaction) throw new Error('The selected wallet cannot sign a Solana transaction.')
  onUpdate('submitting')
  const result = await signer.signAndSendTransaction(decodeBase64Transaction(serialized))
  const signature = typeof result === 'string' ? result : result.signature
  onUpdate('submitted', signature)
  return signature
}
