export function compactAddress(value?: string) {
  if (!value) return '—'
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`
}

export function formatAmount(value: string | number | undefined, maximumFractionDigits = 4) {
  const number = Number(value)
  return Number.isFinite(number) ? new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(number) : '—'
}

// Amount inputs accept digits and a single decimal point only.
export function sanitizeAmount(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot === -1) return cleaned
  return `${cleaned.slice(0, dot + 1)}${cleaned.slice(dot + 1).replace(/\./g, '')}`
}

export function toAtomicAmount(value: string, decimals: number) {
  const [whole = '0', fraction = ''] = value.trim().split('.')
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction)) return undefined
  const normalizedFraction = fraction.slice(0, decimals).padEnd(decimals, '0')
  return BigInt(`${whole || '0'}${normalizedFraction}`)
}

export function fromAtomicAmount(value: string | number | bigint | undefined, decimals: number) {
  if (value === undefined) return undefined
  const raw = BigInt(value)
  const base = 10n ** BigInt(decimals)
  const whole = raw / base
  const fraction = (raw % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}
