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
import { assetsFor, findAsset, isSupportedPair, type Asset, type AssetId, type Network } from '../shared/assets'
import { compactAddress, formatAmount, fromAtomicAmount } from './lib/format'
import {
  getDepositStatus,
  getHealth,
  isPreviewAddress,
  previewAddressFor,
  requestQuote,
  type AcrossQuote,
  type DepositStatus,
} from './lib/quote'
import type { RoutePhase } from './lib/route-viz'
import { pickWallets, walletNetwork } from './lib/wallets'
import { loadSavedDestination, saveDestination, validateAddressFor } from './lib/addresses'
import { loadBalances, type BalanceState } from './lib/balances'
import RoutePath from './components/RoutePath'
import Backdrop from './components/Backdrop'
import Balances from './components/Balances'
import { executeEvmQuote, executeSolanaQuote, type ExecutionUpdate } from './lib/transactions'

const TokenUSDC = tokenIcons.TokenUSDC
const TokenSOL = tokenIcons.TokenSOL

type StatusKind = 'idle' | 'loading' | 'ready' | 'error' | 'submitting' | 'submitted'
type Status = { kind: StatusKind; message?: string; reference?: string }

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
  const [origin, setOrigin] = useState<Network>('tempo')
  const [inputId, setInputId] = useState<AssetId>('pathUSD')
  const [outputId, setOutputId] = useState<AssetId>('USDC')
  const [amount, setAmount] = useState('')
  const [destinationInput, setDestinationInput] = useState(() => loadSavedDestination('solana'))
  const [quote, setQuote] = useState<AcrossQuote>()
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

  const destination: Network = origin === 'tempo' ? 'solana' : 'tempo'
  const input = findAsset(origin, inputId)!
  const output = findAsset(destination, outputId)!

  const wallets = useMemo(() => pickWallets(userWallets), [userWallets])
  const originWallet =
    primaryWallet && walletNetwork(primaryWallet) === origin ? primaryWallet : wallets[origin]
  const destWallet = wallets[destination]
  const supported = isSupportedPair(origin, input.id, destination, output.id)
  // One signing wallet + a destination address. The destination comes from a
  // second connected wallet when present, else from the pasted (saved) input.
  const manualRecipient = destinationInput.trim()
  const manualError = manualRecipient ? validateAddressFor(destination, manualRecipient) : undefined
  const recipientAddress = !manualError && manualRecipient ? manualRecipient : destWallet?.address
  const [quoteMeta, setQuoteMeta] = useState<{ depositor: string; recipient: string }>()
  const quoteLive = Boolean(
    quote && quoteMeta && originWallet?.address === quoteMeta.depositor && recipientAddress === quoteMeta.recipient,
  )
  const receive = quote?.expectedOutputAmount ? fromAtomicAmount(quote.expectedOutputAmount, output.decimals) : undefined
  const relayFee = quote?.totalRelayFee?.total ? fromAtomicAmount(quote.totalRelayFee.total, input.decimals) : undefined
  const busy = status.kind === 'loading' || status.kind === 'submitting'
  const originConnected = Boolean(originWallet)

  function clearQuote() {
    setQuote(undefined)
    setQuoteMeta(undefined)
  }

  function changeOrigin(next: Network) {
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
    // Only the sending wallet signs. The destination is the second connected
    // wallet when present, else the pasted address. Missing sides fall back
    // to placeholders for a preview that can never be signed.
    const depositor = originWallet?.address ?? previewAddressFor(origin)
    const destinationAddress = recipientAddress ?? previewAddressFor(destination)
    const live = Boolean(originWallet && recipientAddress)
    setStatus({ kind: 'loading', message: live ? 'Checking the live Across route…' : 'Checking a preview route…' })
    try {
      const result = await requestQuote({
        origin,
        destination,
        input,
        output,
        amount,
        depositor,
        recipient: destinationAddress,
      })
      setQuote(result)
      setQuoteMeta({ depositor, recipient: destinationAddress })
      if (manualRecipient && !manualError) saveDestination(destination, manualRecipient)
      setStatus({
        kind: 'ready',
        message: live
          ? 'Route ready for review.'
          : !originWallet
            ? 'Preview quote — connect your sending wallet to sign.'
            : 'Preview quote — add a destination address to sign.',
      })
      if (openReview) setReview(true)
    } catch (error) {
      clearQuote()
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Quote unavailable.' })
    }
  }

  // When the signing wallet or destination lands after a preview quote,
  // silently upgrade to an executable live quote. The preview guard runs once.
  useEffect(() => {
    if (!quote || !quoteMeta || !originWallet || !recipientAddress || !amount) return
    if (!isPreviewAddress(quoteMeta.depositor) && !isPreviewAddress(quoteMeta.recipient)) return
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
    if (!quote || !originWallet || !quoteLive) return
    const update: ExecutionUpdate = (stage, reference) =>
      setStatus({
        kind: stage === 'submitted' ? 'submitted' : 'submitting',
        reference,
        message: {
          switching: 'Switching wallet to Tempo…',
          approving: 'Approval requested in wallet…',
          submitting: 'Review and sign in your wallet…',
          submitted: 'Submitted. Across is delivering the route.',
        }[stage],
      })
    try {
      setReview(false)
      if (origin === 'tempo') await executeEvmQuote(originWallet as never, quote, update)
      else await executeSolanaQuote(originWallet as never, quote, update)
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Transaction was not submitted.' })
    }
  }

  const primaryLabel = busy
    ? status.kind === 'loading'
      ? 'Checking route…'
      : 'Waiting for wallet…'
    : !amount
      ? 'Enter an amount'
      : quoteLive
        ? 'Review live route'
        : quote
          ? 'Refresh quote'
          : originConnected && recipientAddress
            ? 'Get live quote'
            : 'Preview route'
  const canSign = originConnected && Boolean(recipientAddress) && !manualError

  const routePhase: RoutePhase =
    status.kind === 'loading'
      ? 'loading'
      : status.kind === 'submitting'
        ? 'submitting'
        : status.kind === 'submitted'
          ? 'submitted'
          : status.kind === 'error'
            ? 'error'
            : quote
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
              Move a supported stablecoin through a live Across quote. Your wallet approves every step — this app never
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
                setAmount(e.target.value)
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
          <small className="field-hint">Sender: {compactAddress(originWallet?.address)} · Balances load after connect.</small>

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
              ? 'Fetching the route — works with or without a connected wallet.'
              : quote
                ? quoteLive
                  ? 'Expected output from the live Across quote.'
                  : 'Preview price — connect your sending wallet and add a destination to sign.'
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
                <>Using connected wallet {compactAddress(destWallet.address)} · or paste a different address.</>
              )
            ) : manualRecipient ? (
              <>Saved on this device after quoting.</>
            ) : (
              <>Only your sending wallet needs to connect — paste where the funds land.</>
            )}
          </small>

          <RoutePath origin={origin.toUpperCase()} destination={destination.toUpperCase()} phase={routePhase} />

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
                  {status.reference && (
                    <a
                      target="_blank"
                      rel="noreferrer"
                      href={
                        origin === 'tempo'
                          ? `https://explore.mainnet.tempo.xyz/tx/${status.reference}`
                          : `https://solscan.io/tx/${status.reference}`
                      }
                    >
                      View <ExternalLink size={12} aria-hidden />
                    </a>
                  )}
                </span>
              </p>
            )}
            {status.kind === 'submitted' && status.reference && (
              <div className="deposit-track" aria-live="polite">
                <strong>Bridging hop: {delivery?.status ? delivery.status : 'submitted — not yet checked'}</strong>
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
          {canSign && quote && !quoteLive && (
            <div className="link-wrap">
              <small className="field-hint">Details changed — refresh for an executable live quote.</small>
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
          <Row label="Route" value={supported ? `${input.symbol} → ${output.symbol}` : 'Unavailable'} />
          <Row label="Provider" value="Across" />
          <Row label="Relay fee" value={relayFee ? `${formatAmount(relayFee)} ${input.symbol}` : 'In live quote'} />
          <Row
            label="Delivery"
            value={quote?.expectedFillTime ? `~${quote.expectedFillTime} seconds` : 'In live quote'}
          />
          <div className="details-note">
            <b>Before you sign</b>
            <p>Check the amount, recipient, route and fee in your wallet. A fresh quote is required if it expires.</p>
          </div>
        </aside>
      </section>

      <section id="how" className="shell process" aria-label="How it works">
        <p className="kicker">How it works · 02</p>
        <div className="process-grid">
          <Step n="01" t="Connect" d="Connect your sending wallet once — EVM or Solana." />
          <Step n="02" t="Quote" d="Paste the destination address; preview or live quotes price instantly." />
          <Step n="03" t="Sign" d="Your wallet approves and submits the bridge deposit." />
          <Step n="04" t="Receive" d="Track the submitted route through to delivery." />
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
                  <Row label="Send from" value={compactAddress(quoteMeta?.depositor)} />
                  <Row label="Receive at" value={compactAddress(quoteMeta?.recipient)} />
                  <Row
                    label="Fee"
                    value={relayFee ? `${formatAmount(relayFee)} ${input.symbol}` : 'Included in quote'}
                  />
                </div>
              </Dialog.Description>
              <p className="notice">
                <CircleAlert size={16} aria-hidden />
                <span>
                  {quoteLive
                    ? 'No transaction has been submitted. The next step opens your sending wallet.'
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
