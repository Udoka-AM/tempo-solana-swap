import { describe, expect, it } from 'vitest'
import { isPreviewAddress, normalizeQuote, previewAddressFor, quoteErrorMessage } from './quote'

describe('quote normalization', () => {
  it('maps Across fees.total.amount onto totalRelayFee for the fee UI', () => {
    const out = normalizeQuote({ fees: { total: { amount: '6701', pct: '1' } } })
    expect(out.totalRelayFee?.total).toBe('6701')
  })

  it('keeps an explicit totalRelayFee when present', () => {
    const out = normalizeQuote({ totalRelayFee: { total: '42' }, fees: { total: { amount: '6701' } } })
    expect(out.totalRelayFee?.total).toBe('42')
  })
})

describe('quote error messages', () => {
  it('explains a missing deployment configuration', () => {
    expect(quoteErrorMessage({ error: 'service_not_configured' }, 503)).toMatch(/not configured/)
  })

  it('calls out rate limiting distinctly', () => {
    expect(quoteErrorMessage({ error: 'quote_unavailable' }, 429)).toMatch(/rate-limiting/)
  })

  it('rejects unsupported pairs plainly', () => {
    expect(quoteErrorMessage({ error: 'unsupported_pair' }, 400)).toMatch(/No live route/)
  })
})

describe('preview addresses', () => {
  it('issues well-formed placeholders per network', () => {
    expect(previewAddressFor('tempo').startsWith('0x')).toBe(true)
    expect(previewAddressFor('solana')).toBe('11111111111111111111111111111111')
  })

  it('detects placeholders so previews can never be signed', () => {
    expect(isPreviewAddress(previewAddressFor('tempo'))).toBe(true)
    expect(isPreviewAddress('0xabc')).toBe(false)
  })
})
