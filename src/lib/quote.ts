import { chainIdFor, type Asset, type Network } from '../../shared/assets'
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
  id?: string
  expectedOutputAmount?: string
  expectedFillTime?: number
  totalRelayFee?: { total?: string; pct?: string }
  fees?: { total?: { amount?: string; pct?: string; amountUsd?: string } }
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

// Well-formed placeholder addresses used for preview quotes when a wallet is
// not connected yet. Preview results price the route but are never signed:
// the review dialog requires both live wallets before any signing step.
export const PREVIEW_EVM_ADDRESS = '0x000000000000000000000000000000000000dEaD'
export const PREVIEW_SOLANA_ADDRESS = '11111111111111111111111111111111'

export function previewAddressFor(network: Network) {
  return network === 'solana' ? PREVIEW_SOLANA_ADDRESS : PREVIEW_EVM_ADDRESS
}

export function isPreviewAddress(address: string | undefined) {
  return address === PREVIEW_EVM_ADDRESS || address === PREVIEW_SOLANA_ADDRESS
}

type QuoteErrorBody = AcrossQuote & { error?: string; detail?: string }

export function normalizeQuote(body: AcrossQuote): AcrossQuote {
  // Across /swap/approval returns fees.total.amount; older readers expect
  // totalRelayFee.total. Normalize so fee + output UI never goes blank.
  const relayTotal = body.totalRelayFee?.total ?? body.fees?.total?.amount
  if (relayTotal && !body.totalRelayFee?.total) {
    return { ...body, totalRelayFee: { total: relayTotal, pct: body.fees?.total?.pct } }
  }
  return body
}

export function quoteFeeUsd(body: AcrossQuote): number | undefined {
  const raw = body.fees?.total?.amountUsd
  const value = raw === undefined ? NaN : Number(raw)
  return Number.isFinite(value) ? value : undefined
}

export function extractUpstreamMessage(detail: string | undefined): string | undefined {
  if (!detail) return undefined
  const marker = 'upstream_'
  const start = detail.indexOf('{', detail.indexOf(marker))
  if (start === -1) return detail.slice(0, 200)
  try {
    const parsed = JSON.parse(detail.slice(start)) as { message?: string }
    return typeof parsed.message === 'string' ? parsed.message : detail.slice(0, 200)
  } catch {
    return detail.slice(0, 200)
  }
}

export function quoteErrorMessage(body: QuoteErrorBody, status: number): string {
  switch (body.error) {
    case 'service_not_configured':
      return 'Live quotes are not configured on this deployment. Set ACROSS_API_KEY and ACROSS_INTEGRATOR_ID as Pages secrets, then redeploy.'
    case 'origin_not_allowed':
      return 'This app domain is not allowed to use the quote API.'
    case 'unsupported_pair':
      return 'No live route is available for this pair.'
    case 'missing_parameter':
    case 'invalid_amount':
      return 'Enter an amount greater than zero.'
    case 'quote_unavailable': {
      if (status === 429) return 'Across is rate-limiting quotes. Wait a few seconds and try again.'
      const upstream = extractUpstreamMessage(body.detail)
      if (upstream) return `Across: ${upstream}`
      return 'Across did not return a quote for this amount. Try a smaller amount.'
    }
    case 'quote_upstream_unavailable':
      return 'Could not reach Across. Check your connection and try again.'
    default:
      if (body.detail) return body.detail.slice(0, 200)
      return 'Quote is unavailable.'
  }
}

export async function requestQuote(input: QuoteInput) {
  const atomic = toAtomicAmount(input.amount, input.input.decimals)
  if (!atomic || atomic <= 0n) throw new Error('Enter an amount greater than zero.')
  const params = new URLSearchParams({
    tradeType: 'exactInput',
    amount: atomic.toString(),
    inputToken: input.input.address,
    outputToken: input.output.address,
    originChainId: String(chainIdFor(input.origin)),
    destinationChainId: String(chainIdFor(input.destination)),
    depositor: input.depositor,
    recipient: input.recipient,
    refundAddress: input.depositor,
    refundOnOrigin: 'true',
    strictTradeType: 'true',
  })
  const response = await fetch(`/api/quote?${params}`)
  const body = (await response.json()) as QuoteErrorBody
  if (!response.ok) throw new Error(quoteErrorMessage(body, response.status))
  return normalizeQuote(body)
}

export type HealthStatus = {
  ok: boolean
  service: string
  timestamp: string
  across?: 'configured' | 'missing'
}

export async function getHealth(): Promise<HealthStatus> {
  const response = await fetch('/api/health', { cache: 'no-store' })
  if (!response.ok) throw new Error('health_unavailable')
  return (await response.json()) as HealthStatus
}

export type DepositStatus = {
  status?: 'pending' | 'filled' | string
  depositTxHash?: string
  fillTx?: string
  fillTxnRef?: string
  destinationChainId?: number
  error?: string
  message?: string
}

export async function getDepositStatus(selector: { depositTxnRef: string } | { originChainId: string; depositId: string }) {
  const params = new URLSearchParams(selector as Record<string, string>)
  const response = await fetch(`/api/deposit-status?${params}`, { cache: 'no-store' })
  const body = (await response.json()) as DepositStatus
  if (!response.ok) throw new Error(body.message || body.error || 'Deposit status is unavailable.')
  return body
}
