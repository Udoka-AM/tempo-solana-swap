import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { feeShares, formatUsd, totalFeeUsd, type HopFeeDatum } from '../lib/fees'

type Props = {
  fees: HopFeeDatum[]
  deliverySeconds?: number
}

// Subtle inline fee reveal: a one-line summary with a proportional segment
// bar that expands in place into per-leg descriptors with mini path charts.
// Never a popup; fully keyboard operable and static under reduced motion.
export default function FeeBreakdown({ fees, deliverySeconds }: Props) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const shares = feeShares(fees)
  const total = formatUsd(totalFeeUsd(fees))
  const fallback = fees.map((fee) => fee.display).filter(Boolean).join(' + ')

  if (fees.length === 0) {
    return <p className="fee-empty">Fees appear with a quote.</p>
  }

  return (
    <div className="fee-break">
      <button
        type="button"
        className="fee-summary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="fee-bar" aria-hidden="true">
          {shares.map((share, index) => (
            <i key={index} style={{ width: `${Math.max(share * 100, 8)}%` }} data-seg={index} />
          ))}
        </span>
        <span className="fee-total">
          {total ? `≈ ${total} network fee` : fallback ? `${fallback} network fee` : 'Network fee in quote'}
          {deliverySeconds !== undefined && deliverySeconds > 0 ? ` · ~${deliverySeconds}s` : ''}
        </span>
        <ChevronDown size={14} aria-hidden className={open ? 'fee-chevron is-open' : 'fee-chevron'} />
      </button>
      <div id={panelId} className={open ? 'fee-detail is-open' : 'fee-detail'}>
        <ul>
          {fees.map((fee, index) => (
            <li key={`${fee.from}-${fee.to}`}>
              <svg viewBox="0 0 72 28" aria-hidden="true" focusable="false" className="fee-mini">
                <line x1="8" y1="14" x2="64" y2="14" stroke="var(--line-soft)" strokeWidth="2" strokeLinecap="round" />
                <circle cx="8" cy="14" r="3" fill="var(--ink)" />
                <circle
                  cx={64 - 56 * (shares[index] ?? 0.5)}
                  cy="14"
                  r={4 + 5 * (shares[index] ?? 0.5)}
                  fill="var(--ink)"
                  opacity={0.85}
                />
                <circle cx="64" cy="14" r="3" fill="var(--accent)" />
              </svg>
              <div>
                <b>
                  {fee.from} → {fee.to}
                </b>
                <span>
                  {fee.display}
                  {fee.amountUsd !== undefined ? ` (${formatUsd(fee.amountUsd)})` : ''}
                  {fee.fillSeconds ? ` · ~${fee.fillSeconds}s` : ''}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
