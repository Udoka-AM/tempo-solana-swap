import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { DynamicWidget, useDynamicContext, useUserWallets } from '@dynamic-labs/sdk-react-core'
import { tokenIcons } from '@web3icons/react'
import {
  ArrowUpDown,
  ArrowUpRight,
  Check,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import { assetsFor, chainIdFor, findAsset, isSupportedPair, type Asset, type AssetId, type Network } from '../shared/assets'
import { compactAddress, formatAmount, fromAtomicAmount, sanitizeAmount } from './lib/format'
import {
  getDepositStatus,
  getHealth,
  isPreviewAddress,
  previewAddressFor,
  quoteFeeUsd,
  requestQuote,
  type AcrossQuote,
  type DepositStatus,
} from './lib/quote'
import type { RoutePhase } from './lib/route-viz'
import type { Direction } from './lib/multihop'
import { hopParties, planHops } from './lib/multihop'
import { pickWallets, walletNetwork } from './lib/wallets'
import { loadSavedDestination, saveDestination, validateAddressFor } from './lib/addresses'
import { loadBalances, type BalanceState } from './lib/balances'
import RoutePath from './components/RoutePath'
import FeeBreakdown from './components/FeeBreakdown'
import type { HopFeeDatum } from './lib/fees'
import Backdrop from './components/Backdrop'
import Balances from './components/Balances'
import { executeEvmQuote, executeSolanaQuote, type ExecutionUpdate } from './lib/transactions'

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
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const userWallets = useUserWallets()
  const [origin, setOrigin] = useState<Direction>('tempo')
  const [inputId, setInputId] = useState<AssetId>('pathUSD')
  const [outputId, setOutputId] = useState<AssetId>('USDC')
  const [amount, setAmount] = useState('')
  const [destinationInput, setDestinationInput] = useState(() => loadSavedDestination('solana'))
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [review, setReview] = useState(false)
  const [apiState, setApiState] = useState<'checking' | 'live' | 'degraded'>('checking')
  const [delivery, setDelivery] = useState<DepositStatus | null>(null)
  const [deliveryState, setDeliveryState] = useState<'idle' | 'checking' | 'error'>('idle')
  const [balances, setBalances] = useState<BalanceState[]>([])
  const [balancesLoading, setBalancesLoading] = useState(false)

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

  const wallets = useMemo(() => pickWallets(userWallets), [userWallets])
  const originWallet =
    primaryWallet && walletNetwork(primaryWallet) === origin ? primaryWallet : wallets[origin]
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
  const hopFees = [0, 1].map((index) => {
    const total = hopQuotes[index]?.totalRelayFee?.total
    return total && hops ? fromAtomicAmount(total, hops[index].input.decimals) : undefined
  })
  const feeData: HopFeeDatum[] = hops
    ? hops.map((hop, index) => ({
        from: hop.origin === 'tempo' ? 'Tempo' : hop.origin === 'base' ? 'Base' : 'Solana',
        to: hop.destination === 'tempo' ? 'Tempo' : hop.destination === 'base' ? 'Base' : 'Solana',
        display:
          hopFees[index] !== undefined
            ? `${formatAmount(hopFees[index])} ${hop.input.symbol}`
            : `In live quote`,
        amountUsd: hopQuotes[index] ? quoteFeeUsd(hopQuotes[index]) : undefined,
        fillSeconds: hopQuotes[index]?.expectedFillTime,
      }))
    : []
  const feeDataLive = hopQuotes.length === 2 ? feeData : []
  const deliverySeconds =
    hopQuotes[0]?.expectedFillTime || hopQuotes[1]?.expectedFillTime
      ? (hopQuotes[0]?.expectedFillTime ?? 0) + (hopQuotes[1]?.expectedFillTime ?? 0)
      : undefined
  const busy = status.kind === 'loading' || status.kind === 'submitting'
  const originConnected = Boolean(originWallet)

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

  function reset() {
    setAmount('')
    clearQuote()
    setStatus({ kind: 'idle' })
    setDelivery(null)
    setDeliveryState('idle')
  }

  async function getQuote(openReview = true) {
    if (manualError) {
      setStatus({ kind: 'error', message: manualError })
      return
    }
    if (!hops) {
      setStatus({ kind: 'error', message: 'This pair cannot form a Tempo ↔ Base ↔ Solana route.' })
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
          ? 'Route ready for review.'
          : !originWallet
            ? 'Preview route — connect your sending wallet to sign.'
            : 'Preview route — add a destination address to sign.',
      })
      if (openReview) setReview(true)
    } catch (error) {
      clearQuote()
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Quote unavailable.' })
    }
  }

  // When the signing wallet or destination lands after a preview, silently
  // upgrade to an executable live route. The preview guard runs once.
  useEffect(() => {
    if (hopQuotes.length !== 2 || hopMetas.length !== 2 || !originWallet || !recipientAddress || !amount) return
    if (hopMetas.every((meta) => !isPreviewAddress(meta.depositor) && !isPreviewAddress(meta.recipient))) return
    void getQuote(false)
    // getQuote is intentionally excluded: the preview guard prevents loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originWallet?.address, recipientAddress])

  async function refreshBalances() {
    setBalancesLoading(true)
    try {
      setBalances(await loadBalances({ tempo: wallets.tempo?.address, solana: wallets.solana?.address }))
    } finally {
      setBalancesLoading(false)
    }
  }

  useEffect(() => {
    void refreshBalances()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets.tempo?.address, wallets.solana?.address])

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
      setReview(false)
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
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Transaction was not submitted.' })
    }
  }

  const primaryLabel = busy
    ? status.kind === 'loading'
      ? 'Finding route…'
      : 'Waiting for wallet…'
    : !amount
      ? 'Enter an amount'
      : quoteLive
        ? 'Review route'
        : hopQuotes.length === 2
          ? 'Refresh route'
          : originConnected && recipientAddress
            ? 'Get live route'
            : 'Preview route'
  const canSign =
    originConnected && Boolean(recipientAddress) && !manualError && (origin === 'tempo' || Boolean(wallets.tempo))

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

  async function checkDelivery() {
    if (!status.reference) return
    setDeliveryState('checking')
    try {
      const result = await getDepositStatus({ depositTxnRef: status.reference })
      setDelivery(result)
      setDeliveryState('idle')
    } catch {
      setDeliveryState('error')
    }
  }

  return (
    <main id="top">
      <Backdrop />
      {/* Focused header: brand, minimal nav, status, single connect action */}
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
            <DynamicWidget
              buttonClassName="dynamic-button"
              innerButtonComponent={
                <>
                  <Wallet size={15} aria-hidden /> Connect
                </>
              }
            />
          </div>
        </div>
      </header>

      {/* Simple intro: one job, one sentence */}
      <section className="shell hero">
        <div className="hero-grid">
          <div>
            <p className="kicker">Stablecoin corridor · Non-custodial</p>
            <h1>
              One deliberate route between <em>Tempo</em> and Solana.
            </h1>
            <p className="hero-sub">
              Move a supported stablecoin through a live Across route. Your wallet approves each step — this app never
              holds keys or submits for you.
            </p>
          </div>
          <aside className="scope-card" id="scope" aria-label="Release scope">
            <small>RELEASE SCOPE</small>
            <strong>
              pathUSD / USDC.e <b>↔</b> USDC
            </strong>
            <span>Tempo 4217 · Solana mainnet · SOL is gas only</span>
          </aside>
        </div>
      </section>

      {/* Wallet status */}
      <section className="shell wallets" aria-label="Connected wallets">
        <WalletCard
          chain="Tempo · 4217"
          address={wallets.tempo?.address}
          connected={Boolean(wallets.tempo)}
          hint={wallets.tempo ? 'EVM wallet connected' : 'Connect an EVM wallet'}
        />
        <ArrowUpRight className="wallets-arrow" aria-hidden />
        <WalletCard
          chain="Solana · Mainnet"
          address={wallets.solana?.address}
          connected={Boolean(wallets.solana)}
          hint={wallets.solana ? 'Solana wallet connected' : 'Connect a Solana wallet'}
        />
      </section>

      <Balances
        loading={balancesLoading}
        balances={balances}
        tempoAddress={wallets.tempo?.address}
        solanaAddress={wallets.solana?.address}
        onConnect={() => setShowAuthFlow(true)}
        onRefresh={refreshBalances}
      />

      {/* Swap */}
      <section className="shell swap-section" id="swap" aria-label="Swap">
        <div className="swap-card">
          <div className="card-top">
            <b>ROUTE BUILDER</b>
            <button type="button" className="btn-ghost" onClick={reset}>
              <RefreshCw size={14} aria-hidden /> Reset
            </button>
          </div>
          <p className="api-status" data-state={apiState} role="status" style={{ margin: '0 0 14px' }}>
            <i className="live-dot" aria-hidden />
            {apiState === 'live' ? 'Quote API live' : apiState === 'checking' ? 'Checking quote API…' : 'Quote API not configured — see README secrets'}
          </p>

          <div className="chain-tabs" role="group" aria-label="Direction">
            <button type="button" aria-pressed={origin === 'tempo'} onClick={() => changeOrigin('tempo')}>
              From Tempo
            </button>
            <button type="button" aria-pressed={origin === 'solana'} onClick={() => changeOrigin('solana')}>
              From Solana
            </button>
          </div>

          <label className="field-label" htmlFor="send-amount">
            You send
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
          <small className="field-hint">
            {originWallet ? (
              <>Sender: {compactAddress(originWallet.address)} · Balances load after connect.</>
            ) : (
              <span className="connect-row">
                <span>No sending wallet.</span>
                <button type="button" className="btn-ghost" onClick={() => setShowAuthFlow(true)}>
                  Connect {origin === 'tempo' ? 'EVM' : 'Solana'} wallet <ArrowUpRight size={14} aria-hidden />
                </button>
              </span>
            )}
          </small>

          <div className="flip-row">
            <span aria-hidden />
            <button type="button" className="flip-btn" onClick={flipDirection} aria-label="Switch direction">
              <ArrowUpDown size={16} aria-hidden />
            </button>
            <span aria-hidden />
          </div>

          <label className="field-label">You receive</label>
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
              ? 'Finding your route — works with or without a connected wallet.'
              : hopQuotes.length === 2
                ? quoteLive
                  ? 'Expected output across the full route.'
                  : 'Preview price across the full route — connect your sending wallet and add a destination to sign.'
                : 'Request a quote to see what you receive. No wallet or balance needed.'}
          </small>

          <label className="field-label" htmlFor="dest-address" style={{ marginTop: 16 }}>
            Destination address ({destination === 'tempo' ? 'EVM' : 'Solana'})
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
                <>Overriding connected wallet {compactAddress(destWallet.address)} · saved on this device after quoting.</>
              ) : (
                <>Using connected wallet {compactAddress(destWallet.address)} · or paste a different address below.</>
              )
            ) : manualRecipient ? (
              <>Saved on this device after quoting.</>
            ) : (
              <span className="connect-row">
                <button type="button" className="btn-ghost" onClick={() => setShowAuthFlow(true)}>
                  Connect {destination === 'tempo' ? 'EVM' : 'Solana'} wallet <ArrowUpRight size={14} aria-hidden />
                </button>
                <span>or paste an address — linking a second wallet keeps one session.</span>
              </span>
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
            {status.kind === 'submitted' && (
              <p className="notice success" role="status">
                <Check size={16} aria-hidden />
                <span>
                  {status.message}{' '}
                  {(status.references ?? (status.reference ? [status.reference] : [])).map((hash, index) => (
                    <a
                      key={hash}
                      target="_blank"
                      rel="noreferrer"
                      href={explorerFor(hops?.[index]?.origin ?? origin, hash)}
                    >
                      Receipt {index + 1} <ExternalLink size={12} aria-hidden />{' '}
                    </a>
                  ))}
                </span>
              </p>
            )}
            {status.kind === 'submitted' && status.reference && (
              <div className="deposit-track" aria-live="polite">
                <strong>Delivery: {delivery?.status ? delivery.status : 'submitted — not yet checked'}</strong>
                <span>
                  {delivery?.fillTx || delivery?.fillTxnRef
                    ? `Fill tx: ${compactAddress(delivery.fillTx ?? delivery.fillTxnRef)}`
                    : 'Across fills typically land in seconds. Check delivery status to confirm the hop.'}
                </span>
                <span>
                  <button type="button" className="btn-ghost" onClick={checkDelivery} disabled={deliveryState === 'checking'}>
                    {deliveryState === 'checking' ? 'Checking delivery…' : 'Check delivery status'}
                  </button>
                  {deliveryState === 'error' && ' — status lookup failed. Retry in 15 seconds.'}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn-primary"
            disabled={!supported || !amount || busy || Boolean(manualError)}
            onClick={() => getQuote()}
          >
            {busy && <LoaderCircle className="spin" size={16} aria-hidden />}
            {primaryLabel}
          </button>
          {!canSign && (
            <div className="link-wrap">
              <small className="field-hint">
                {!originConnected && !recipientAddress
                  ? 'No sending wallet and no destination — you can still preview a quote.'
                  : !originConnected
                    ? `Connect your ${origin === 'tempo' ? 'EVM' : 'Solana'} sending wallet to sign — preview works now.`
                    : 'Add a destination address to sign — preview works now.'}
              </small>
              {!originConnected && (
                <button type="button" className="link-button" onClick={() => setShowAuthFlow(true)}>
                  Connect sending wallet <ArrowUpRight size={14} aria-hidden />
                </button>
              )}
            </div>
          )}
          {canSign && hopQuotes.length === 2 && !quoteLive && (
            <div className="link-wrap">
              <small className="field-hint">Details changed — refresh for an executable live route.</small>
            </div>
          )}
          {!supported && (
            <small className="field-hint">This pair is not supported. SOL is gas only and cannot be bridged.</small>
          )}
        </div>

        <aside className="details" aria-label="Route details">
          <h2>
            ROUTE DETAILS <ShieldCheck size={16} aria-hidden />
          </h2>
          <Row label="Route" value={supported && hops ? `${hops[0].input.symbol} → ${hops[1].output.symbol}` : 'Unavailable'} />
          <Row label="Provider" value="Across" />
          <FeeBreakdown fees={feeDataLive} deliverySeconds={deliverySeconds} />
          <div className="details-note">
            <b>Before you sign</b>
            <p>Check the amount, recipient, route and fee in your wallet. Fresh quotes are required if they expire.</p>
          </div>
        </aside>
      </section>

      <section id="how" className="shell process" aria-label="How it works">
        <p className="kicker">How it works · 02</p>
        <div className="process-grid">
          <Step n="01" t="Connect" d="Connect your sending wallet once — EVM or Solana." />
          <Step n="02" t="Quote" d="Paste the destination; routes price instantly." />
          <Step n="03" t="Sign" d="Approve hop 1 to Base, then hop 2 onward — two signatures." />
          <Step n="04" t="Receive" d="Track both hops through to final delivery." />
        </div>
      </section>

      <Dialog.Root open={review} onOpenChange={setReview}>
        <Dialog.Portal>
          <Dialog.Overlay className="backdrop">
            <Dialog.Content
              className="review-card"
              aria-label="Review transaction"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div className="card-top">
                <b>REVIEW TRANSACTION</b>
                <Dialog.Close asChild>
                  <button type="button" className="btn-ghost">
                    Cancel
                  </button>
                </Dialog.Close>
              </div>
              <Dialog.Title asChild>
                <h2>
                  {formatAmount(amount)} {input.symbol} <ArrowUpRight size={17} aria-hidden />{' '}
                  {receive ? formatAmount(receive) : '—'} {output.symbol}
                </h2>
              </Dialog.Title>
              <Dialog.Description asChild>
                <div>
                  <Row label="Send from" value={compactAddress(hopMetas[0]?.depositor)} />
                  <Row label="Receive at" value={compactAddress(hopMetas[1]?.recipient)} />
                </div>
              </Dialog.Description>
              <FeeBreakdown fees={feeData} deliverySeconds={deliverySeconds} />
              <p className="notice">
                <CircleAlert size={16} aria-hidden />
                <span>
                  {quoteLive
                    ? 'No transaction has been submitted. Two signatures follow — one per hop.'
                    : 'Preview only — connect your sending wallet and add a destination address for an executable route.'}
                </span>
              </p>
              {quoteLive ? (
                <button type="button" className="btn-primary" onClick={submit}>
                  Sign in wallet
                </button>
              ) : (
                <button type="button" className="btn-primary" onClick={() => { setReview(false); setShowAuthFlow(true) }}>
                  Connect sending wallet
                </button>
              )}
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Portal>
      </Dialog.Root>

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

function WalletCard({ chain, address, connected, hint }: { chain: string; address?: string; connected: boolean; hint: string }) {
  return (
    <article className={`wallet-card ${connected ? 'is-on' : 'is-off'}`}>
      <small>{chain}</small>
      <strong>{address ? compactAddress(address) : 'Not connected'}</strong>
      <span>{hint}</span>
    </article>
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
