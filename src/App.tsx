import { useEffect, useMemo, useState } from 'react'
import { NetworkSolana, NetworkTempo, tokenIcons } from '@web3icons/react'
import {
  ArrowUpDown,
  ArrowUpRight,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react'
import { assetsFor, chainIdFor, findAsset, isSupportedPair, type Asset, type AssetId, type Network } from '../shared/assets'
import { compactAddress, formatAmount, fromAtomicAmount, sanitizeAmount } from './lib/format'
import {
  getHealth,
  isPreviewAddress,
  previewAddressFor,
  requestQuote,
  type AcrossQuote,
} from './lib/quote'
import { corridorLabel, type RoutePhase } from './lib/route-viz'
import type { Direction } from './lib/multihop'
import { hopParties, planHops } from './lib/multihop'
import { loadSavedDestination, saveDestination, validateAddressFor } from './lib/addresses'
import { executeEvmQuote, executeSolanaQuote, type ExecutionUpdate } from './lib/transactions'
import RoutePath from './components/RoutePath'
import { useSolanaWallet, useTempoWallet } from './components/wallet-context'

const TokenUSDC = tokenIcons.TokenUSDC
const TokenSOL = tokenIcons.TokenSOL

type StatusKind = 'idle' | 'loading' | 'ready' | 'error' | 'submitting' | 'submitted'
type Status = { kind: StatusKind; message?: string; reference?: string; references?: string[] }

function Icon({ asset }: { asset: Asset }) {
  if (asset.id === 'USDC') return <TokenUSDC className="token" aria-hidden />
  if (asset.id === 'SOL') return <TokenSOL className="token" aria-hidden />
  return (
    <i className="token token-text" aria-hidden>
      {asset.symbol[0]}
    </i>
  )
}

function AssetPicker({
  assets,
  value,
  onChange,
  label,
}: {
  assets: Asset[]
  value: AssetId
  onChange: (id: AssetId) => void
  label: string
}) {
  const asset = assets.find((entry) => entry.id === value) ?? assets[0]
  return (
    <label className="asset-picker">
      <Icon asset={asset} />
      <select value={value} onChange={(event) => onChange(event.target.value as AssetId)} aria-label={label}>
        {assets.map((entry) => (
          <option value={entry.id} key={entry.id}>
            {entry.symbol}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function App() {
  const tempoContext = useTempoWallet()
  const solanaContext = useSolanaWallet()
  const [origin, setOrigin] = useState<Direction>('tempo')
  const [inputId, setInputId] = useState<AssetId>('pathUSD')
  const [outputId, setOutputId] = useState<AssetId>('USDC')
  const [amount, setAmount] = useState('')
  const [destinationInput, setDestinationInput] = useState(() => loadSavedDestination('solana'))
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [attemptSig, setAttemptSig] = useState('')
  const [apiState, setApiState] = useState<'checking' | 'live' | 'degraded'>('checking')
  const [successOpen, setSuccessOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    getHealth()
      .then((health) => {
        if (!cancelled) setApiState(health.across === 'configured' ? 'live' : 'degraded')
      })
      .catch(() => {
        if (!cancelled) setApiState('degraded')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const destination: Direction = origin === 'tempo' ? 'solana' : 'tempo'
  const input = findAsset(origin, inputId)!
  const output = findAsset(destination, outputId)!

  const wallets = { tempo: tempoContext.wallet, solana: solanaContext.wallet }
  const originWallet = wallets[origin]
  const destWallet = wallets[destination]
  // Multihop corridor via Base: Tempo -> Base USDC -> Solana USDC (or reverse).
  // Ends are selectable; the proxy hop is automatic.
  const hops = useMemo(() => planHops(origin, inputId, outputId), [origin, inputId, outputId])
  const supported = Boolean(hops) && hops!.every((hop) => isSupportedPair(hop.origin, hop.input.id, hop.destination, hop.output.id))
  // One signing wallet + a destination address. The destination comes from a
  // second connected wallet when present, else from the pasted (saved) input.
  const manualRecipient = destinationInput.trim()
  const manualError = manualRecipient ? validateAddressFor(destination, manualRecipient) : undefined
  const recipientAddress = !manualError && manualRecipient ? manualRecipient : destWallet?.address
  const [hopQuotes, setHopQuotes] = useState<AcrossQuote[]>([])
  const [hopMetas, setHopMetas] = useState<{ depositor: string; recipient: string }[]>([])
  const quoteLive = Boolean(
    hops &&
      hopQuotes.length === 2 &&
      hopMetas.length === 2 &&
      originWallet?.address === hopMetas[0]?.depositor &&
      recipientAddress === hopMetas[1]?.recipient &&
      (origin === 'tempo' || wallets.tempo?.address === hopMetas[1]?.depositor),
  )
  const receive = hopQuotes[1]?.expectedOutputAmount
    ? fromAtomicAmount(hopQuotes[1].expectedOutputAmount, hops?.[1].output.decimals ?? 6)
    : undefined
  const deliverySeconds =
    hopQuotes[0]?.expectedFillTime || hopQuotes[1]?.expectedFillTime
      ? (hopQuotes[0]?.expectedFillTime ?? 0) + (hopQuotes[1]?.expectedFillTime ?? 0)
      : undefined
  const busy = status.kind === 'loading' || status.kind === 'submitting'
  const routePhase: RoutePhase =
    status.kind === 'loading'
      ? 'loading'
      : status.kind === 'submitting'
        ? 'submitting'
        : status.kind === 'submitted'
          ? 'submitted'
          : status.kind === 'error'
            ? 'error'
            : hopQuotes.length === 2
              ? 'ready'
              : 'idle'

  function clearQuote() {
    setHopQuotes([])
    setHopMetas([])
  }

  function changeOrigin(next: Direction) {
    const nextDestination: Network = next === 'tempo' ? 'solana' : 'tempo'
    setOrigin(next)
    setInputId(next === 'tempo' ? 'pathUSD' : 'USDC')
    setOutputId(next === 'tempo' ? 'USDC' : 'pathUSD')
    setDestinationInput(loadSavedDestination(nextDestination))
    clearQuote()
    setStatus({ kind: 'idle' })
  }

  function flipDirection() {
    changeOrigin(destination)
  }

  function connectNetworkWallet(network: Direction) {
    if (network === 'tempo') tempoContext.connect()
    else solanaContext.connect()
  }

  function reset() {
    setAmount('')
    clearQuote()
    setStatus({ kind: 'idle' })
    setSuccessOpen(false)
  }

  async function getQuote() {
    if (manualError) {
      setStatus({ kind: 'error', message: manualError })
      return
    }
    if (!hops) {
      setStatus({ kind: 'error', message: 'This pair cannot form a route.' })
      return
    }
    // Hop 1 prices the send amount; hop 2 prices hop 1's output. Only the
    // sending wallet signs hop 1 and the EVM side signs hop 2 — missing
    // sides fall back to placeholders for a preview that can never be signed.
    const sender = originWallet?.address ?? previewAddressFor(origin)
    const final = recipientAddress ?? previewAddressFor(destination)
    const [parties1, parties2] = hopParties(origin, sender, final)
    const live = Boolean(originWallet && recipientAddress && (origin === 'tempo' || wallets.tempo))
    setStatus({ kind: 'loading', message: 'Finding your route…' })
    try {
      const first = await requestQuote({
        origin: hops[0].origin,
        destination: hops[0].destination,
        input: hops[0].input,
        output: hops[0].output,
        amount,
        depositor: parties1.depositor,
        recipient: parties1.recipient,
      })
      const firstOut = fromAtomicAmount(first.expectedOutputAmount, hops[0].output.decimals)
      if (!firstOut) throw new Error('The route returned no output amount.')
      const second = await requestQuote({
        origin: hops[1].origin,
        destination: hops[1].destination,
        input: hops[1].input,
        output: hops[1].output,
        amount: firstOut,
        depositor: parties2.depositor,
        recipient: parties2.recipient,
      })
      setHopQuotes([first, second])
      setHopMetas([parties1, parties2])
      if (manualRecipient && !manualError) saveDestination(destination, manualRecipient)
      setStatus({
        kind: 'ready',
        message: live
          ? 'Route ready.'
          : !originWallet
            ? 'Preview — connect your sending wallet to sign.'
            : 'Preview — add a destination address to sign.',
      })
    } catch (error) {
      clearQuote()
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Quote unavailable.' })
    }
  }

  // Automatic route preview: typing an amount prices the route without any
  // tap. Runs once per unique request signature so failures never loop.
  const requestSig = `${origin}|${inputId}|${outputId}|${amount}|${destinationInput}`
  useEffect(() => {
    if (!amount || !supported || busy || hopQuotes.length === 2 || requestSig === attemptSig) return
    const timer = setTimeout(() => {
      setAttemptSig(requestSig)
      void getQuote()
    }, 700)
    return () => clearTimeout(timer)
    // getQuote excluded by design; requestSig + attemptSig gate every run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestSig, attemptSig, amount, supported, busy, hopQuotes.length])

  // When the signing wallet or destination lands after a preview, silently
  // upgrade to an executable live route. The preview guard runs once.
  useEffect(() => {
    if (hopQuotes.length !== 2 || hopMetas.length !== 2 || !originWallet || !recipientAddress || !amount) return
    if (hopMetas.every((meta) => !isPreviewAddress(meta.depositor) && !isPreviewAddress(meta.recipient))) return
    void getQuote()
    // getQuote is intentionally excluded: the preview guard prevents loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originWallet?.address, recipientAddress])

  async function submit() {
    if (!hops || hopQuotes.length !== 2 || !originWallet || !quoteLive) return
    const evmWallet = origin === 'tempo' ? originWallet : wallets.tempo
    if (!evmWallet) {
      setStatus({ kind: 'error', message: 'Connect an EVM wallet to complete signing.' })
      return
    }
    async function runHop(index: 0 | 1) {
      const hop = hops![index]
      const label = `Signature ${index + 1} of 2`
      let hash: string | undefined
      const update: ExecutionUpdate = (stage, reference) => {
        if (stage === 'submitted' && reference) hash = reference
        setStatus({
          kind: 'submitting',
          reference,
          message:
            stage === 'switching'
              ? `${label}: switching network…`
              : stage === 'approving'
                ? `${label}: approval requested in wallet…`
                : `${label}: review and sign in your wallet…`,
        })
      }
      if (hop.origin === 'solana') {
        await executeSolanaQuote(originWallet as never, hopQuotes[index], update)
      } else {
        await executeEvmQuote(evmWallet as never, hopQuotes[index], update, chainIdFor(hop.origin))
      }
      if (!hash) throw new Error(`${label} did not return a transaction hash.`)
      return hash
    }
    try {
      setStatus({ kind: 'submitting', message: 'Submitting signature 1 of 2…' })
      const hash1 = await runHop(0)
      setStatus({ kind: 'submitting', reference: hash1, references: [hash1], message: 'First signature done — sign the second…' })
      const hash2 = await runHop(1)
      setStatus({
        kind: 'submitted',
        reference: hash2,
        references: [hash1, hash2],
        message: 'Submitted. Your funds are on their way.',
      })
      setSuccessOpen(true)
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Transaction was not submitted.' })
    }
  }

  return (
    <main id="top">
      <header className="site-header">
        <div className="site-header-inner">
          <a href="#top" className="wordmark" aria-label="Tempo Solana Swap home">
            TEMPO<span>×</span>SOLANA
          </a>
          <nav className="site-nav" aria-label="Sections">
            <a href="#swap">Swap</a>
            <a href="#how">How it works</a>
            <a href="#scope">Scope</a>
          </nav>
          <div className="header-actions">
            <span className="live-badge" role="status" data-state={apiState}>
              <i className="live-dot" aria-hidden />
              <span className="txt">{apiState === 'live' ? 'Live routes' : apiState === 'checking' ? 'Checking API…' : 'API degraded'}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Simple intro: one job, one sentence */}
      <section className="shell hero">
        <div className="hero-grid">
          <div>
            <p className="kicker">Stablecoins · Tempo ↔ Solana</p>
            <h1>
              Move stablecoins between <em>Tempo</em> and Solana.
            </h1>
            <p className="hero-sub">Choose your wallets, enter an amount, and review the route before signing.</p>
          </div>
          <aside className="scope-card" id="scope" aria-label="Release scope">
            <small>SUPPORTED ASSETS</small>
            <strong>
              pathUSD / USDC.e <b>↔</b> USDC
            </strong>
            <span>Tempo 4217 · Base 8453 · Solana mainnet</span>
          </aside>
        </div>
      </section>

      <section className="shell swap-section" id="swap" aria-label="Swap">
        <div className="swap-card">
          <div className="card-top">
            <b>SWAP</b>
            <button type="button" className="btn-ghost" onClick={reset}>
              <RefreshCw size={14} aria-hidden /> Reset
            </button>
          </div>
          <div className="chain-tabs" role="group" aria-label="Direction">
            <button type="button" aria-pressed={origin === 'tempo'} onClick={() => changeOrigin('tempo')}>
              Tempo → Solana
            </button>
            <button type="button" aria-pressed={origin === 'solana'} onClick={() => changeOrigin('solana')}>
              Solana → Tempo
            </button>
          </div>

          <div className="wallet-pair" aria-label="Wallets">
            <WalletSlot network={origin} address={originWallet?.address} onConnect={() => connectNetworkWallet(origin)} label="From" />
            <ArrowUpRight className="wallet-pair-arrow" aria-hidden />
            <WalletSlot network={destination} address={destWallet?.address} onConnect={() => connectNetworkWallet(destination)} label="To" />
          </div>
          <label className="field-label" htmlFor="send-amount">
            Send
          </label>
          <div className="amount">
            <input
              id="send-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                setAmount(sanitizeAmount(e.target.value))
                clearQuote()
              }}
            />
            <AssetPicker
              value={inputId}
              assets={assetsFor(origin).filter((entry) => entry.bridgeable)}
              onChange={(id) => {
                setInputId(id)
                clearQuote()
              }}
              label="Token you send"
            />
          </div>
          <small className="field-hint">Quote updates as you type.</small>

          <div className="flip-row">
            <span aria-hidden />
            <button type="button" className="flip-btn" onClick={flipDirection} aria-label="Switch direction">
              <ArrowUpDown size={16} aria-hidden />
            </button>
            <span aria-hidden />
          </div>

          <label className="field-label">Receive</label>
          <div className="receive" aria-live="polite" aria-busy={status.kind === 'loading'}>
            {status.kind === 'loading' ? (
              <span className="skeleton skeleton-large" role="status" aria-label="Fetching quote" />
            ) : (
              <strong>{receive ? formatAmount(receive) : '—'}</strong>
            )}
            <AssetPicker
              value={outputId}
              assets={assetsFor(destination).filter((entry) => entry.bridgeable)}
              onChange={(id) => {
                setOutputId(id)
                clearQuote()
              }}
              label="Token you receive"
            />
          </div>
          <small className="field-hint">
            {status.kind === 'loading'
              ? 'Finding the best route…'
              : hopQuotes.length === 2
                ? quoteLive
                  ? 'Expected output across the full route.'
                  : 'Preview only — connect the required signing wallets to continue.'
                : 'Enter an amount to preview the route.'}
          </small>

          <label className="field-label destination-label" htmlFor="dest-address">
            Recipient address <span>(optional)</span>
          </label>
          <div className="amount dest-field">
            <input
              id="dest-address"
              autoComplete="off"
              spellCheck={false}
              placeholder={destination === 'tempo' ? '0x…' : 'Paste Solana address…'}
              value={destinationInput}
              onChange={(e) => {
                setDestinationInput(e.target.value)
                clearQuote()
              }}
            />
          </div>
          <small className="field-hint" aria-live="polite">
            {manualError ? (
              <span className="dest-error">{manualError}</span>
            ) : destWallet?.address ? (
              manualRecipient ? (
                <>Overriding connected wallet · saved on this device.</>
              ) : (
                <>Using the connected wallet · or paste a different address.</>
              )
            ) : manualRecipient ? (
              <>Saved on this device after quoting.</>
            ) : (
              <>Use the To wallet above, or paste a different recipient.</>
            )}
          </small>

          <RoutePath from={origin} to={destination} phase={routePhase} />

          <div aria-live="polite">
            {status.kind === 'error' && (
              <p className="notice error" role="alert">
                <CircleAlert size={16} aria-hidden />
                <span>{status.message}</span>
              </p>
            )}
          </div>

          {status.kind === 'submitted' ? (
            <button type="button" className="btn-primary" onClick={reset} style={{ marginTop: 12 }}>
              Start a new swap
            </button>
          ) : hopQuotes.length === 2 && status.kind === 'ready' ? (
            <div className="review-inline quote-reveal" aria-label="Review route">
              <h3>{quoteLive ? 'READY TO SIGN' : 'QUOTE'}</h3>
              <p className="review-total">
                {formatAmount(amount)} {input.symbol} <ArrowUpRight size={15} aria-hidden />{' '}
                {receive ? formatAmount(receive) : '—'} {output.symbol}
              </p>
              <Row label="To" value={compactAddress(hopMetas[1]?.recipient)} />
              <Row label="Route" value={corridorLabel(origin === 'tempo' ? 'Tempo' : 'Solana', destination === 'tempo' ? 'Tempo' : 'Solana')} />
              <Row label="Fee" value={hopQuotes[0]?.totalRelayFee?.total ? `${formatAmount(fromAtomicAmount(hopQuotes[0].totalRelayFee.total, input.decimals))} ${input.symbol}` : 'Included in quote'} />
              <Row label="Delivery" value={deliverySeconds ? `~${deliverySeconds} seconds` : 'A few seconds'} />
              {quoteLive ? (
                  <button type="button" className="btn-primary" onClick={submit}>
                  Sign in wallet
                </button>
              ) : (
                <p className="notice"><CircleAlert size={16} aria-hidden /><span>Connect the required signing wallets above to sign.</span></p>
              )}
            </div>
          ) : (
            status.kind === 'error' && <button type="button" className="btn-primary" disabled={busy} onClick={() => getQuote()}>{busy && <LoaderCircle className="spin" size={16} aria-hidden />}Try again</button>
          )}
          {!supported && (
            <small className="field-hint">This pair is not supported. SOL is gas only and cannot be bridged.</small>
          )}
        </div>

      </section>

      <section id="how" className="shell process" aria-label="How it works">
        <p className="kicker">How it works · 02</p>
        <div className="process-grid">
          <Step n="01" t="Connect" d="Choose a From and To wallet above." />
          <Step n="02" t="Quote" d="Type an amount — pricing is automatic." />
          <Step n="03" t="Sign" d="Approve the signatures your wallet shows." />
          <Step n="04" t="Receive" d="Track delivery to the end." />
        </div>
      </section>

      {successOpen && status.kind === 'submitted' && (
        <section className="success-dialog-backdrop" role="presentation">
          <div className="success-dialog" role="dialog" aria-modal="true" aria-labelledby="success-title">
            <button type="button" className="dialog-close" onClick={() => setSuccessOpen(false)} aria-label="Close success dialog">×</button>
            <svg className="success-check" viewBox="0 0 56 56" aria-hidden="true" focusable="false">
              <circle cx="28" cy="28" r="26" />
              <path d="M17 29 l8 8 l14 -16" />
            </svg>
            <p className="kicker">Transaction submitted</p>
            <h2 id="success-title">On its way.</h2>
            <p>{formatAmount(amount)} {input.symbol} → {receive ? formatAmount(receive) : '—'} {output.symbol}</p>
            <span className="success-receipts">
              {(status.references ?? (status.reference ? [status.reference] : [])).map((hash, index) => (
                <a key={hash} target="_blank" rel="noreferrer" href={explorerFor(hops?.[index]?.origin ?? origin, hash)}>
                  Receipt {index + 1} <ExternalLink size={12} aria-hidden />
                </a>
              ))}
            </span>
            <button type="button" className="btn-primary" onClick={() => { setSuccessOpen(false); reset() }}>Start a new swap</button>
          </div>
        </section>
      )}


      <footer className="site-footer">
        <div className="site-footer-inner">
          <span>TEMPO × SOLANA SWAP</span>
          <span>Non-custodial · Stablecoin-only</span>
          <a target="_blank" rel="noreferrer" href="https://github.com/Udoka-AM/tempo-solana-swap">
            Source <ArrowUpRight size={13} aria-hidden />
          </a>
        </div>
      </footer>
    </main>
  )
}

function explorerFor(network: Network, hash: string) {
  if (network === 'solana') return `https://solscan.io/tx/${hash}`
  if (network === 'base') return `https://basescan.org/tx/${hash}`
  return `https://explore.mainnet.tempo.xyz/tx/${hash}`
}

function WalletSlot({ network, address, onConnect, label }: { network: Network; address?: string; onConnect: () => void; label: string }) {
  const logo = network === 'solana' ? <NetworkSolana className="slot-logo" aria-hidden /> : <NetworkTempo className="slot-logo" aria-hidden />
  const name = network === 'solana' ? 'Solana' : 'Tempo'
  return (
    <div className="wallet-slot">
      <small>{label}</small>
      {address ? (
        <span className="slot-chip">{logo}<strong>{name}</strong><b>{compactAddress(address)}</b></span>
      ) : (
        <button type="button" className="slot-connect" onClick={onConnect} aria-label={`Connect ${name} wallet`}>
          {logo} Connect {name}
        </button>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <p className="row">
      <span>{label}</span>
      <strong>{value}</strong>
    </p>
  )
}

function Step({ n, t, d }: { n: string; t: string; d: string }) {
  return (
    <article>
      <small>{n}</small>
      <h2>{t}</h2>
      <p>{d}</p>
    </article>
  )
}
