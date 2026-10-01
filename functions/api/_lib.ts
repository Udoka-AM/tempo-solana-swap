import { ASSETS, BASE_CHAIN_ID, SOLANA_CHAIN_ID, TEMPO_CHAIN_ID, type AssetId, type Network, findAsset, isSupportedPair } from '../../shared/assets'

export type Env = {
  ACROSS_API_KEY: string
  ACROSS_INTEGRATOR_ID: string
  PUBLIC_APP_ORIGIN?: string
  // Integrator fee: a decimal fraction (0.0025 = 0.25%) plus one recipient
  // per destination ecosystem. Fees are off unless all of them are valid.
  ACROSS_APP_FEE?: string
  ACROSS_FEE_RECIPIENT_EVM?: string
  ACROSS_FEE_RECIPIENT_SVM?: string
}

const MAX_APP_FEE = 0.05
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/
const SVM_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function appFeeRate(env: Env): string | undefined {
  const raw = env.ACROSS_APP_FEE?.trim()
  if (!raw || !/^0?\.\d+$/.test(raw)) return undefined
  const value = Number(raw)
  return value > 0 && value <= MAX_APP_FEE ? raw : undefined
}

// The fee is collected once per swap, on the leg that delivers to the user's
// final network (Tempo or Solana). Across pays it on that destination chain.
export function appFeeFor(destination: Network, env: Env): { appFee: string; appFeeRecipient: string } | undefined {
  const rate = appFeeRate(env)
  if (!rate || destination === 'base') return undefined
  const recipient = destination === 'solana' ? env.ACROSS_FEE_RECIPIENT_SVM?.trim() : env.ACROSS_FEE_RECIPIENT_EVM?.trim()
  if (!recipient || !(destination === 'solana' ? SVM_ADDRESS : EVM_ADDRESS).test(recipient)) return undefined
  return { appFee: rate, appFeeRecipient: recipient }
}

const ACROSS_API = 'https://app.across.to/api'
const UPSTREAM_TIMEOUT_MS = 12_000
const MAX_UPSTREAM_DETAIL = 500

function summarizeUpstream(body: unknown, status: number) {
  try {
    const text = typeof body === 'string' ? body : JSON.stringify(body)
    return `upstream_${status}:${text.slice(0, MAX_UPSTREAM_DETAIL)}`
  } catch {
    return `upstream_${status}`
  }
}
const allowedQuoteFields = [
  'tradeType', 'amount', 'inputToken', 'outputToken', 'originChainId', 'destinationChainId',
  'depositor', 'recipient', 'refundAddress', 'refundOnOrigin', 'slippage', 'strictTradeType',
  'skipOriginTxEstimation',
] as const

const toNetwork = (chain: string | null): Network | undefined =>
  chain === String(TEMPO_CHAIN_ID)
    ? 'tempo'
    : chain === String(SOLANA_CHAIN_ID)
      ? 'solana'
      : chain === String(BASE_CHAIN_ID)
        ? 'base'
        : undefined

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
  const output = ASSETS.find((asset) => asset.network === destinationNetwork && asset.address.toLowerCase() === params.get('outputToken')!.toLowerCase())
  if (!input || !output || !isSupportedPair(originNetwork, input.id, destinationNetwork, output.id)) return { error: apiError('unsupported_pair', 400) } as const
  if (!/^\d+$/.test(params.get('amount')!)) return { error: apiError('invalid_amount', 400) } as const

  return { params, input, output } as const
}

export function makeAcrossQuery(params: URLSearchParams, integratorId: string, env?: Env) {
  const result = new URLSearchParams()
  for (const key of allowedQuoteFields) {
    const value = params.get(key)
    if (value) result.set(key, value)
  }
  result.set('integratorId', integratorId)
  const destination = toNetwork(params.get('destinationChainId'))
  const fee = env && destination ? appFeeFor(destination, env) : undefined
  if (fee) {
    result.set('appFee', fee.appFee)
    result.set('appFeeRecipient', fee.appFeeRecipient)
  }
  return result
}

export async function fetchAcrossQuote(params: URLSearchParams, env: Env, fetcher: typeof fetch = fetch) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetcher(`${ACROSS_API}/swap/approval?${makeAcrossQuery(params, env.ACROSS_INTEGRATOR_ID, env)}`, {
      headers: { authorization: `Bearer ${env.ACROSS_API_KEY}`, 'user-agent': 'tempo-solana-swap/1.0' },
      signal: controller.signal,
    })
  } catch (error) {
    return apiError('quote_upstream_unavailable', 502, error instanceof Error ? error.name : 'fetch_failed')
  } finally {
    clearTimeout(timeout)
  }
  let body: unknown
  try { body = await response.json() } catch { body = { error: 'invalid_upstream_response' } }
  if (!response.ok)
    return apiError(
      'quote_unavailable',
      response.status === 429 ? 429 : 502,
      summarizeUpstream(body, response.status),
    )
  return json(body)
}

const allowedDepositStatusFields = ['originChainId', 'depositId', 'depositTxnRef'] as const

export function validateDepositStatus(request: Request): { error: Response; params?: never } | { params: URLSearchParams; error?: never } {
  const params = new URL(request.url).searchParams
  const filtered = new URLSearchParams()
  for (const key of allowedDepositStatusFields) {
    const value = params.get(key)
    if (value) filtered.set(key, value)
  }
  // Across accepts either depositTxnRef alone, or originChainId + depositId together.
  const byHash = Boolean(filtered.get('depositTxnRef'))
  const byId = Boolean(filtered.get('originChainId') && filtered.get('depositId'))
  if (!byHash && !byId) return { error: apiError('missing_parameter', 400, 'depositTxnRef or originChainId+depositId') } as const
  return { params: filtered } as const
}

export async function fetchDepositStatus(params: URLSearchParams, env: Env, fetcher: typeof fetch = fetch) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetcher(`${ACROSS_API}/deposit/status?${params}`, {
      headers: { authorization: `Bearer ${env.ACROSS_API_KEY}`, 'user-agent': 'tempo-solana-swap/1.0' },
      signal: controller.signal,
    })
  } catch (error) {
    return apiError('deposit_status_unavailable', 502, error instanceof Error ? error.name : 'fetch_failed')
  } finally {
    clearTimeout(timeout)
  }
  let body: unknown
  try { body = await response.json() } catch { body = { error: 'invalid_upstream_response' } }
  if (!response.ok) return apiError('deposit_status_unavailable', 502, summarizeUpstream(body, response.status))
  return json(body)
}

export function tokenFor(chain: Network, id: AssetId) {
  return findAsset(chain, id)
}

const allowedMetaResources = ['chains', 'tokens'] as const
export type MetaResource = (typeof allowedMetaResources)[number]

export function validateMetaResource(request: Request): { error: Response; resource?: never } | { resource: MetaResource; error?: never } {
  const resource = new URL(request.url).searchParams.get('resource')
  if (resource !== 'chains' && resource !== 'tokens') return { error: apiError('missing_parameter', 400, 'resource=chains|tokens') } as const
  return { resource } as const
}

export async function fetchAcrossMeta(resource: MetaResource, env: Env, fetcher: typeof fetch = fetch) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetcher(`${ACROSS_API}/swap/${resource}`, {
      headers: { authorization: `Bearer ${env.ACROSS_API_KEY}`, 'user-agent': 'tempo-solana-swap/1.0' },
      signal: controller.signal,
    })
  } catch (error) {
    return apiError('meta_unavailable', 502, error instanceof Error ? error.name : 'fetch_failed')
  } finally {
    clearTimeout(timeout)
  }
  let body: unknown
  try { body = await response.json() } catch { body = { error: 'invalid_upstream_response' } }
  if (!response.ok) return apiError('meta_unavailable', 502, summarizeUpstream(body, response.status))
  return json(body)
}
