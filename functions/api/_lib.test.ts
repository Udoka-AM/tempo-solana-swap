import { describe, expect, it, vi } from 'vitest'
import { SOLANA_CHAIN_ID, TEMPO_CHAIN_ID } from '../../shared/assets'
import { fetchAcrossQuote, validateQuote, type Env } from './_lib'

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
    expect((fetcher as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1]).toEqual({ headers: { authorization: 'Bearer server-secret' } })
  })

  it('maps an Across error without leaking credentials', async () => {
    const result = validateQuote(new Request(`https://swap.example${validPath}`))
    if (!('params' in result)) throw new Error('expected valid parameters')
    const response = await fetchAcrossQuote(result.params!, env, (async () => new Response(JSON.stringify({ message: 'no route' }), { status: 404 })) as typeof fetch)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: 'quote_unavailable' })
  })
})
