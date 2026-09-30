export type HopFeeDatum = {
  from: string
  to: string
  display: string
  amountUsd?: number
  fillSeconds?: number
}

// Proportional shares for the fee visualization. Falls back to an even split
// when USD figures are missing so the chart never lies with fake precision.
export function feeShares(fees: HopFeeDatum[]): number[] {
  if (fees.length === 0) return []
  const values = fees.map((fee) => (fee.amountUsd !== undefined && fee.amountUsd > 0 ? fee.amountUsd : NaN))
  if (values.some((value) => Number.isNaN(value))) {
    return fees.map(() => 1 / fees.length)
  }
  const total = values.reduce((sum, value) => sum + (value as number), 0)
  if (total <= 0) return fees.map(() => 1 / fees.length)
  return (values as number[]).map((value) => value / total)
}

export function totalFeeUsd(fees: HopFeeDatum[]): number | undefined {
  if (fees.length === 0 || fees.some((fee) => fee.amountUsd === undefined)) return undefined
  return fees.reduce((sum, fee) => sum + (fee.amountUsd as number), 0)
}

export function formatUsd(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return undefined
  if (value === 0) return '$0'
  if (value < 0.01) return '<$0.01'
  return `$${value.toFixed(value < 1 ? 3 : 2)}`
}
