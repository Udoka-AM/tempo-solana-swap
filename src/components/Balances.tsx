import { RefreshCw, Wallet } from 'lucide-react'
import type { BalanceState } from '../lib/balances'
import { compactAddress } from '../lib/format'

type Props = {
  loading: boolean
  balances: BalanceState[]
  tempoAddress?: string
  solanaAddress?: string
  onConnect: () => void
  onRefresh: () => void
}

export default function Balances({ loading, balances, tempoAddress, solanaAddress, onConnect, onRefresh }: Props) {
  const connected = Boolean(tempoAddress || solanaAddress)
  return (
    <section className="shell balances" aria-label="Token balances">
      <div className="balances-head">
        <b>BALANCES</b>
        {connected && (
          <button type="button" className="btn-ghost" onClick={onRefresh} disabled={loading} aria-label="Refresh balances">
            <RefreshCw size={14} aria-hidden className={loading ? 'spin' : ''} /> Refresh
          </button>
        )}
      </div>
      {!connected ? (
        <button type="button" className="balances-empty" onClick={onConnect}>
          <Wallet size={15} aria-hidden /> Connect wallets to see balances
        </button>
      ) : (
        <ul className="balances-grid">
          {balances.map((row) => (
            <li key={`${row.network}-${row.assetId}`} className="balance-card">
              <small>
                {row.symbol} · {row.network === 'tempo' ? compactAddress(tempoAddress) : compactAddress(solanaAddress)}
              </small>
              {loading ? (
                <span className="skeleton" aria-label="Loading balance" />
              ) : (
                <strong>{row.display ?? '—'}</strong>
              )}
              <span>{row.unavailable ?? (row.display === undefined && !loading ? 'Not loaded yet.' : `${row.symbol} available`)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
