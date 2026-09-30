import { ASSETS, SOLANA_CHAIN_ID, TEMPO_CHAIN_ID, type AssetId, type Network, findAsset, isSupportedPair } from '../../shared/assets'

export type Env = {
  ACROSS_API_KEY: string
  ACROSS_INTEGRATOR_ID: string
  PUBLIC_APP_ORIGIN?: string
}

const ACROSS_API = 'https://app.across.to/api'
const allowedQuoteFields = [
  'tradeType', 'amount', 'inputToken', 'outputToken', 'originChainId', 'destinationChainId',
  'depositor', 'recipient', 'refundAddress', 'refundOnOrigin', 'slippage', 'strictTradeType',
  'skipOriginTxEstimation',
] as const

const toNetwork = (chain: string | null): Network | undefined =>
  chain === String(TEMPO_CHAIN_ID) ? 'tempo' : chain === String(SOLANA_CHAIN_ID) ? 'solana' : undefined

export function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } })
}

export function apiError(code: string, status: number, detail?: string) {
  return json({ error: code, ...(detail ? { detail } : {}) }, status)
}

export function assertSameOrigin(request: Request, env: Env): Response | undefined {
  const origin = request.headers.get('origin')
  if (!origin || !env.PUBLIC_APP_ORIGIN) return undefined
  return origin === env.PUBLIC_APP_ORIGIN ? undefined : apiError('origin_not_allowed', 403)
}

export function supportedTokens() {
  return ASSETS.map(({ id, network, address, decimals, label, symbol, bridgeable }) => ({ id, network, address, decimals, label, symbol, bridgeable }))
}

export function validateQuote(request: Request): { error: Response; params?: never; input?: never; output?: never } | { params: URLSearchParams; input: (typeof ASSETS)[number]; output: (typeof ASSETS)[number]; error?: never } {
  const params = new URL(request.url).searchParams
  const required = ['amount', 'inputToken', 'outputToken', 'originChainId', 'destinationChainId', 'depositor', 'recipient']
  const missing = required.find((key) => !params.get(key))
  if (missing) return { error: apiError('missing_parameter', 400, missing) } as const

  const originNetwork = toNetwork(params.get('originChainId'))
  const destinationNetwork = toNetwork(params.get('destinationChainId'))
  if (!originNetwork || !destinationNetwork) return { error: apiError('unsupported_chain', 400) } as const
  const input = ASSETS.find((asset) => asset.network === originNetwork && asset.address.toLowerCase() === params.get('inputToken')!.toLowerCase())
  const output = ASSETS.find((asset) => asset.network === destinationNetwork && asset.address === params.get('outputToken'))
  if (!input || !output || !isSupportedPair(originNetwork, input.id, destinationNetwork, output.id)) return { error: apiError('unsupported_pair', 400) } as const
  if (!/^\d+$/.test(params.get('amount')!)) return { error: apiError('invalid_amount', 400) } as const

  return { params, input, output } as const
}

export function makeAcrossQuery(params: URLSearchParams, integratorId: string) {
  const result = new URLSearchParams()
  for (const key of allowedQuoteFields) {
    const value = params.get(key)
    if (value) result.set(key, value)
  }
  result.set('integratorId', integratorId)
  return result
}

export async function fetchAcrossQuote(params: URLSearchParams, env: Env, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`${ACROSS_API}/swap/approval?${makeAcrossQuery(params, env.ACROSS_INTEGRATOR_ID)}`, {
    headers: { authorization: `Bearer ${env.ACROSS_API_KEY}` },
  })
  let body: unknown
  try { body = await response.json() } catch { body = { error: 'invalid_upstream_response' } }
  if (!response.ok) return apiError('quote_unavailable', response.status === 429 ? 429 : 502, typeof body === 'object' && body ? JSON.stringify(body) : undefined)
  return json(body)
}

export function tokenFor(chain: Network, id: AssetId) {
  return findAsset(chain, id)
}
