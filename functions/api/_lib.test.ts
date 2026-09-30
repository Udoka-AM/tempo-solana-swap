import { describe, expect, it, vi } from 'vitest'
import { SOLANA_CHAIN_ID, TEMPO_CHAIN_ID } from '../../shared/assets'
import {
  fetchAcrossMeta,
  fetchAcrossQuote,
  fetchDepositStatus,
  validateDepositStatus,
  validateMetaResource,
  validateQuote,
  type Env,
} from './_lib'

const env: Env = { ACROSS_API_KEY: 'server-secret', ACROSS_INTEGRATOR_ID: 'integrator-live-id' }
const validPath = `/api/quote?amount=1000000&inputToken=0x20c0000000000000000000000000000000000000&outputToken=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&originChainId=${TEMPO_CHAIN_ID}&destinationChainId=${SOLANA_CHAIN_ID}&depositor=0xabc&recipient=4Nd1mN1mN1mN1mN1mN1mN1mN1mN1mN1mN1mN1mN1m`

describe('same-origin Across quote proxy', () => {
  it('accepts only the stablecoin release pairs', () => {
    const valid = validateQuote(new Request(`https://swap.example${validPath}`))
    expect('params' in valid).toBe(true)
    const unsupported = validateQuote(new Request(`https://swap.example${validPath.replace('outputToken=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'outputToken=So11111111111111111111111111111111111111112')}`))
    expect('error' in unsupported).toBe(true)
  })

  it('injects the server-side integrator ID and discards a caller value', async () => {
    const result = validateQuote(new Request(`https://swap.example${validPath}&integratorId=attacker`))
    if (!('params' in result)) throw new Error('expected valid parameters')
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ quoteId: 'q_1' }))) as unknown as typeof fetch
    const response = await fetchAcrossQuote(result.params!, env, fetcher)
    expect(response.status).toBe(200)
    const url = String((fetcher as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])
    expect(url).toContain('integratorId=integrator-live-id')
    expect(url).not.toContain('attacker')
    expect((fetcher as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1]).toMatchObject({
      headers: { authorization: 'Bearer server-secret', 'user-agent': 'tempo-solana-swap/1.0' },
    })
  })

  it('maps an Across error without leaking credentials', async () => {
    const result = validateQuote(new Request(`https://swap.example${validPath}`))
    if (!('params' in result)) throw new Error('expected valid parameters')
    const response = await fetchAcrossQuote(result.params!, env, (async () => new Response(JSON.stringify({ message: 'no route' }), { status: 404 })) as typeof fetch)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: 'quote_unavailable' })
  })

  it('maps a fetcher failure to quote_upstream_unavailable', async () => {
    const result = validateQuote(new Request(`https://swap.example${validPath}`))
    if (!('params' in result)) throw new Error('expected valid parameters')
    const failing = vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    const response = await fetchAcrossQuote(result.params!, env, failing)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: 'quote_upstream_unavailable' })
  })

  it('validates deposit-status selectors without forwarding extra params', async () => {
    const missing = validateDepositStatus(new Request('https://swap.example/api/deposit-status'))
    expect('error' in missing).toBe(true)
    const byHash = validateDepositStatus(new Request('https://swap.example/api/deposit-status?depositTxnRef=0xabc&evil=1'))
    if (!('params' in byHash)) throw new Error('expected valid params')
    expect(byHash.params!.get('depositTxnRef')).toBe('0xabc')
    expect(byHash.params!.get('evil')).toBeNull()
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: 'filled' }))) as unknown as typeof fetch
    const response = await fetchDepositStatus(byHash.params!, env, fetcher)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'filled' })
  })

  it('proxies Across swap metadata for supported chains and tokens', async () => {
    const bad = validateMetaResource(new Request('https://swap.example/api/across-meta'))
    expect('error' in bad).toBe(true)
    const good = validateMetaResource(new Request('https://swap.example/api/across-meta?resource=chains'))
    if (!('resource' in good)) throw new Error('expected valid resource')
    expect(good.resource).toBe('chains')
    const fetcher = vi.fn(async () => new Response(JSON.stringify([{ chainId: 4217 }]))) as unknown as typeof fetch
    const response = await fetchAcrossMeta(good.resource!, env, fetcher)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject([{ chainId: 4217 }])
    const url = String((fetcher as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])
    expect(url).toContain('/swap/chains')
  })
})
