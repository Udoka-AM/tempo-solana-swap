import { SOLANA_CHAIN_ID, TEMPO_CHAIN_ID, type Asset, type Network } from '../../shared/assets'
import { toAtomicAmount } from './format'

export type AcrossTransaction = {
  ecosystem?: 'evm' | 'svm' | 'solana'
  chainId?: number
  to?: string
  data?: `0x${string}`
  value?: string
  // Across's SVM response may return an encoded transaction; it is signed
  // unchanged by the wallet and never decoded into a manufactured transfer.
  serializedTransaction?: string
}

export type AcrossQuote = {
  quoteId?: string
  expectedOutputAmount?: string
  expectedFillTime?: number
  totalRelayFee?: { total?: string; pct?: string }
  approvalTxns?: AcrossTransaction[]
  swapTx?: AcrossTransaction
  depositTx?: AcrossTransaction
}

type QuoteInput = {
  origin: Network
  destination: Network
  input: Asset
  output: Asset
  amount: string
  depositor: string
  recipient: string
}

export async function requestQuote(input: QuoteInput) {
  const atomic = toAtomicAmount(input.amount, input.input.decimals)
  if (!atomic || atomic <= 0n) throw new Error('Enter an amount greater than zero.')
  const params = new URLSearchParams({
    tradeType: 'exactInput',
    amount: atomic.toString(),
    inputToken: input.input.address,
    outputToken: input.output.address,
    originChainId: String(input.origin === 'tempo' ? TEMPO_CHAIN_ID : SOLANA_CHAIN_ID),
    destinationChainId: String(input.destination === 'tempo' ? TEMPO_CHAIN_ID : SOLANA_CHAIN_ID),
    depositor: input.depositor,
    recipient: input.recipient,
    refundAddress: input.depositor,
    refundOnOrigin: 'true',
    strictTradeType: 'true',
  })
  const response = await fetch(`/api/quote?${params}`)
  const body = await response.json() as AcrossQuote & { error?: string; detail?: string }
  if (!response.ok) throw new Error(body.detail || (body.error === 'unsupported_pair' ? 'No live route is available for this pair.' : 'Quote is unavailable.'))
  return body
}
