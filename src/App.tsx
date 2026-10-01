import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { NetworkSolana, NetworkTempo, tokenIcons } from '@web3icons/react'
import {
  ArrowDownUp,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardPaste,
  ExternalLink,
  History,
  LoaderCircle,
  Menu,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  Wallet,
  X,
} from 'lucide-react'
import { assetsFor, chainIdFor, findAsset, isSupportedPair, type Asset, type AssetId, type Network } from '../shared/assets'
import { compactAddress, formatAmount, fromAtomicAmount, sanitizeAmount } from './lib/format'
import { getHealth, previewAddressFor, quoteFeeUsd, requestQuote, type AcrossQuote } from './lib/quote'
import type { Direction } from './lib/multihop'
import { hopParties, planHops } from './lib/multihop'
import { loadSavedDestination, saveDestination, validateAddressFor } from './lib/addresses'
import { executeEvmQuote, executeSolanaQuote, type ExecutionUpdate } from './lib/transactions'
import { loadBalances, type BalanceState } from './lib/balances'
import { formatUsd } from './lib/fees'
import { type DynamicWallet, useSolanaWallet, useTempoWallet } from './components/wallet-context'

const TokenUSDC = tokenIcons.TokenUSDC
const APP_VERSION = 'v1.0.0'
const HISTORY_KEY = 'tempo-solana:history'
const THEME_KEY = 'tempo-solana:theme'

type StatusKind = 'idle' | 'loading' | 'ready' | 'error' | 'submitting' | 'submitted'
type Status = { kind: StatusKind; message?: string; reference?: string; references?: string[] }
type Panel = 'about' | 'history' | null
type Receipt = {
  at: number
  sent: string
  sentSymbol: string
  received?: string
  receivedSymbol: string
  from: Direction
  to: Direction
  tx: string
}

const networkName = (network: Network) => (network === 'tempo' ? 'Tempo' : 'Solana')

function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeStore(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be unavailable (private mode); the app works without it.
  }
}

function NetworkLogo({ network, className }: { network: Network; className?: string }) {
  return network === 'solana' ? <NetworkSolana className={className} aria-hidden /> : <NetworkTempo className={className} aria-hidden />
}

function TokenIcon({ asset, network }: { asset: Asset; network: Network }) {
  return (
    <span className="token-icon">
      {asset.id === 'USDC' ? (
        <TokenUSDC className="token-glyph" aria-hidden />
      ) : (
        <i className="token-glyph token-text" aria-hidden>
          {asset.symbol[0]}
        </i>
      )}
      <NetworkLogo network={network} className="token-badge" />
    </span>
  )
}

type TokenOption = { network: Direction; asset: Asset }

function TokenSelect({
  options,
  value,
  onChange,
  label,
}: {
  options: TokenOption[]
  value: TokenOption
  onChange: (option: TokenOption) => void
  label: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, open, () => setOpen(false))
  return (
    <div className="token-select" ref={ref}>
      <button
        type="button"
        className="token-pill"
        aria-label={`${label}: ${value.asset.symbol} on ${networkName(value.network)}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <TokenIcon asset={value.asset} network={value.network} />
        <span>{value.asset.symbol}</span>
        <ChevronDown size={16} aria-hidden />
      </button>
      {open && (
        <ul className="token-menu" role="listbox" aria-label={label}>
          {options.map((option) => {
            const active = option.network === value.network && option.asset.id === value.asset.id
            return (
              <li key={`${option.network}:${option.asset.id}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setOpen(false)
                    onChange(option)
                  }}
                >
                  <TokenIcon asset={option.asset} network={option.network} />
                  <span className="token-menu-text">
                    <strong>{option.asset.symbol}</strong>
                    <small>{networkName(option.network)}</small>
                  </span>
                  {active && <Check size={16} aria-hidden />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, open, close])
}

const bridgeable = (network: Direction): TokenOption[] =>
  assetsFor(network)
    .filter((asset) => asset.bridgeable)
    .map((asset) => ({ network, asset }))

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
  const [balances, setBalances] = useState<BalanceState[]>([])
  const [panel, setPanel] = useState<Panel>(null)
  const [navOpen, setNavOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [history, setHistory] = useState<Receipt[]>(() => readStore<Receipt[]>(HISTORY_KEY, []))
  const [theme, setTheme] = useState<'light' | 'dark'>(() => readStore<'light' | 'dark'>(THEME_KEY, 'light'))
  const settingsRef = useRef<HTMLDivElement>(null)
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  useDismiss(settingsRef, settingsOpen, closeSettings)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    writeStore(THEME_KEY, theme)
  }, [theme])

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

  const tempoAddress = wallets.tempo?.address
  const solanaAddress = wallets.solana?.address
  const refreshBalances = useCallback(() => {
    if (!tempoAddress && !solanaAddress) {
      setBalances([])
      return
    }
    loadBalances({ tempo: tempoAddress, solana: solanaAddress })
      .then(setBalances)
      .catch(() => setBalances([]))
  }, [tempoAddress, solanaAddress])
  useEffect(refreshBalances, [refreshBalances])

  const sourceBalance = balances.find((row) => row.network === origin && row.assetId === inputId)
  const balanceValue = sourceBalance?.raw !== undefined ? fromAtomicAmount(sourceBalance.raw, input.decimals) : undefined
  const overBalance = Boolean(balanceValue !== undefined && amount && Number(amount) > Number(balanceValue))

  const hops = useMemo(() => planHops(origin, inputId, outputId), [origin, inputId, outputId])
  const supported = Boolean(hops) && hops!.every((hop) => isSupportedPair(hop.origin, hop.input.id, hop.destination, hop.output.id))
  const manualRecipient = destinationInput.trim()
  const manualError = manualRecipient ? validateAddressFor(destination, manualRecipient) : undefined
  const recipientAddress = !manualError && manualRecipient ? manualRecipient : undefined
  const needsTempoSigner = origin === 'solana' && !wallets.tempo

  const signingHint = !originWallet
    ? `Connect your ${networkName(origin)} wallet to swap.`
    : !recipientAddress
      ? 'Add a recipient address to swap.'
      : needsTempoSigner
        ? 'Connect a Tempo wallet to complete this direction.'
        : 'Connect required wallets.'
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
  const feeParts = hopQuotes.map(quoteFeeUsd)
  const networkFeeUsd = feeParts.length === 2 && feeParts.every((v) => v !== undefined) ? feeParts.reduce((a, b) => a! + b!, 0) : undefined
  const rate = receive && Number(amount) > 0 ? Number(receive) / Number(amount) : undefined
  const costPct = rate !== undefined ? Math.max(0, (1 - rate) * 100) : undefined
  const busy = status.kind === 'loading' || status.kind === 'submitting'

  function clearQuote() {
    setHopQuotes([])
    setHopMetas([])
  }

  function changeOrigin(next: Direction, nextInput?: AssetId) {
    const nextDestination: Network = next === 'tempo' ? 'solana' : 'tempo'
    setOrigin(next)
    setInputId(nextInput ?? (next === 'tempo' ? 'pathUSD' : 'USDC'))
    setOutputId(next === 'tempo' ? 'USDC' : 'pathUSD')
    setDestinationInput(loadSavedDestination(nextDestination))
    clearQuote()
    setStatus({ kind: 'idle' })
    const nextWalletContext = next === 'tempo' ? tempoContext : solanaContext
    if (nextWalletContext.wallet) void nextWalletContext.activate()
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

  function setFraction(fraction: number) {
    if (balanceValue === undefined) return
    const value = (Number(balanceValue) * fraction).toFixed(input.decimals)
    setAmount(sanitizeAmount(value.replace(/\.?0+$/, '')))
    clearQuote()
  }

  async function pasteRecipient() {
    try {
      const text = (await navigator.clipboard.readText()).trim()
      if (text) {
        setDestinationInput(text)
        clearQuote()
      }
    } catch {
      document.getElementById('dest-address')?.focus()
    }
  }

  async function getQuote() {
    if (manualError) {
      setStatus({ kind: 'error', message: manualError })
      return
    }
    if (!hops) {
      setStatus({ kind: 'error', message: 'This pair is not available.' })
      return
    }
    // Leg 1 prices the send amount; leg 2 prices leg 1's output. Missing
    // wallets fall back to placeholders for a preview that can never be signed.
    const sender = originWallet?.address ?? previewAddressFor(origin)
    const final = recipientAddress ?? previewAddressFor(destination)
    const evmSigner = wallets.tempo?.address ?? previewAddressFor('base')
    const [parties1, parties2] = hopParties(origin, sender, final, evmSigner)
    setStatus({ kind: 'loading', message: 'Fetching best price…' })
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
      if (!firstOut) throw new Error('No output amount was quoted.')
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
      setStatus({ kind: 'ready' })
    } catch (error) {
      clearQuote()
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Quote unavailable.' })
    }
  }

  // Typing an amount prices the swap without a tap. Runs once per unique
  // request signature so failures never loop.
  const requestSig = `${origin}|${inputId}|${outputId}|${amount}|${destinationInput}|${originWallet?.address ?? ''}|${wallets.tempo?.address ?? ''}|${recipientAddress ?? ''}`
  useEffect(() => {
    if (!amount || Number(amount) <= 0 || !supported || busy || requestSig === attemptSig) return
    const timer = setTimeout(() => {
      setAttemptSig(requestSig)
      void getQuote()
    }, 700)
    return () => clearTimeout(timer)
    // getQuote excluded by design; requestSig + attemptSig gate every run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestSig, attemptSig, amount, supported, busy, hopQuotes.length])

  async function submit() {
    if (!hops || hopQuotes.length !== 2 || !originWallet || !quoteLive) return
    const evmWallet = origin === 'tempo' ? originWallet : wallets.tempo
    if (!evmWallet) {
      setStatus({ kind: 'error', message: 'Connect a Tempo wallet to complete signing.' })
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
                : `${label}: confirm in your wallet…`,
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
      setStatus({ kind: 'submitting', message: 'Signature 1 of 2: confirm in your wallet…' })
      const hash1 = await runHop(0)
      setStatus({ kind: 'submitting', reference: hash1, references: [hash1], message: 'Signature 2 of 2: confirm in your wallet…' })
      const hash2 = await runHop(1)
      setStatus({ kind: 'submitted', reference: hash1, references: [hash1, hash2], message: 'Submitted. Your funds are on their way.' })
      const receipt: Receipt = {
        at: Date.now(),
        sent: amount,
        sentSymbol: input.symbol,
        received: receive,
        receivedSymbol: output.symbol,
        from: origin,
        to: destination,
        tx: hash1,
      }
      setHistory((prev) => {
        const next = [receipt, ...prev].slice(0, 25)
        writeStore(HISTORY_KEY, next)
        return next
      })
      setSuccessOpen(true)
      refreshBalances()
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Transaction was not submitted.' })
    }
  }

  const sourceOptions = [...bridgeable('tempo'), ...bridgeable('solana')]
  const destinationOptions = bridgeable(destination)

  const action: { label: string; onClick?: () => void; disabled?: boolean; spin?: boolean } = (() => {
    if (status.kind === 'submitted') return { label: 'Start a new swap', onClick: reset }
    if (status.kind === 'submitting') return { label: 'Confirm in wallet…', disabled: true, spin: true }
    if (!originWallet) return { label: 'Connect Wallet', onClick: () => connectNetworkWallet(origin) }
    if (!supported) return { label: 'Pair not available', disabled: true }
    if (!amount || Number(amount) <= 0) return { label: 'Enter an amount', disabled: true }
    if (overBalance) return { label: `Insufficient ${input.symbol}`, disabled: true }
    if (!recipientAddress) return { label: manualError ? 'Invalid recipient' : 'Add a recipient', onClick: () => document.getElementById('dest-address')?.focus() }
    if (needsTempoSigner) return { label: 'Connect Tempo wallet', onClick: () => tempoContext.connect() }
    if (status.kind === 'loading') return { label: 'Fetching best price…', disabled: true, spin: true }
    if (status.kind === 'error') return { label: 'Try again', onClick: () => void getQuote() }
    if (quoteLive) return { label: 'Swap', onClick: () => void submit() }
    return { label: 'Get quote', onClick: () => void getQuote() }
  })()

  const sliderPct = balanceValue && Number(balanceValue) > 0 && amount ? Math.min(100, Math.round((Number(amount) / Number(balanceValue)) * 100)) : 0

  return (
    <div className="app" id="top">
      <header className="topbar">
        <div className="topbar-inner">
          <a href="#top" className="brand" aria-label="Tempo ⇌ Solana home">
            <span className="brand-mark" aria-hidden>⇌</span>
            <span className="brand-logos" aria-hidden>
              <NetworkTempo variant="mono" className="brand-logo brand-logo-tempo" />
              <NetworkSolana variant="branded" className="brand-logo" />
            </span>
          </a>
          <nav className={`nav ${navOpen ? 'open' : ''}`} aria-label="Primary">
            <button type="button" className={`nav-pill ${panel === null ? 'active' : ''}`} onClick={() => { setPanel(null); setNavOpen(false) }}>Swap</button>
            <button type="button" className={`nav-pill ${panel === 'about' ? 'active' : ''}`} onClick={() => { setPanel('about'); setNavOpen(false) }}>About</button>
            <button type="button" className={`nav-pill ${panel === 'history' ? 'active' : ''}`} onClick={() => { setPanel('history'); setNavOpen(false) }}>My History</button>
          </nav>
          <div className="topbar-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            >
              {theme === 'light' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
            </button>
            {sourceBalance?.display !== undefined && (
              <span className="balance-chip">
                {formatAmount(sourceBalance.display, 2)} <small>{input.symbol}</small>
              </span>
            )}
            <WalletButton
              origin={origin}
              tempo={{ ...tempoContext }}
              solana={{ ...solanaContext }}
            />
            <button type="button" className="icon-btn menu-btn" aria-label="Menu" aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}>
              {navOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
            </button>
          </div>
        </div>
      </header>

      <main className="stage">
        <section className="card" aria-labelledby="swap-title">
          <div className="card-head">
            <div>
              <h1 id="swap-title">Swap</h1>
              <p>Move stablecoins between Tempo and Solana in an instant</p>
            </div>
            <div className="settings" ref={settingsRef}>
              <button type="button" className="icon-btn" aria-label="Swap settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((v) => !v)}>
                <Settings size={20} aria-hidden />
              </button>
              {settingsOpen && (
                <div className="popover" role="menu">
                  <button type="button" role="menuitem" onClick={() => { reset(); setSettingsOpen(false) }}>
                    <RefreshCw size={15} aria-hidden /> Reset swap
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setDestinationInput('')
                      saveDestination(destination, '')
                      clearQuote()
                      setSettingsOpen(false)
                    }}
                  >
                    <X size={15} aria-hidden /> Clear saved recipient
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-row panel-top">
              <label htmlFor="send-amount">From</label>
              <span className="muted">
                Balance: {sourceBalance?.display !== undefined ? formatAmount(sourceBalance.display, 4) : '—'}
              </span>
            </div>
            <div className="panel-row panel-main">
              <input
                id="send-amount"
                className="amount-input"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={amount}
                onChange={(e) => {
                  setAmount(sanitizeAmount(e.target.value))
                  clearQuote()
                }}
              />
              <TokenSelect
                label="Token you send"
                options={sourceOptions}
                value={{ network: origin, asset: input }}
                onChange={(option) => {
                  if (option.network !== origin) changeOrigin(option.network, option.asset.id)
                  else {
                    setInputId(option.asset.id)
                    clearQuote()
                  }
                }}
              />
            </div>
            <div className="panel-row panel-foot">
              <span className="muted">~{formatUsd(Number(amount) || 0)}</span>
              <span className="quick">
                <button type="button" disabled={balanceValue === undefined} onClick={() => setFraction(0.5)}>Half</button>
                <button type="button" disabled={balanceValue === undefined} onClick={() => setFraction(1)}>Max</button>
              </span>
            </div>
            {balanceValue !== undefined && (
              <div className="slider">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={sliderPct}
                  aria-label="Percent of balance"
                  style={{ '--pct': `${sliderPct}%` } as CSSProperties}
                  onChange={(e) => setFraction(Number(e.target.value) / 100)}
                />
                <div className="slider-scale" aria-hidden>
                  <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                </div>
              </div>
            )}
          </div>

          <div className="flip-wrap">
            <button type="button" className="flip" onClick={() => changeOrigin(destination)} aria-label="Switch direction">
              <ArrowDownUp size={18} aria-hidden />
            </button>
          </div>

          <div className="panel">
            <div className="panel-row panel-top">
              <span>To (estimated)</span>
              <span className="muted net-tag">
                <NetworkLogo network={destination} className="net-tag-logo" /> {networkName(destination)}
              </span>
            </div>
            <div className="panel-row panel-main">
              <output className={`amount-input amount-output ${receive ? '' : 'empty'}`} aria-live="polite" aria-busy={status.kind === 'loading'}>
                {status.kind === 'loading' ? <span className="skeleton" /> : receive ? formatAmount(receive, 6) : '0'}
              </output>
              <TokenSelect
                label="Token you receive"
                options={destinationOptions}
                value={{ network: destination, asset: output }}
                onChange={(option) => {
                  setOutputId(option.asset.id)
                  clearQuote()
                }}
              />
            </div>
            <div className="panel-row panel-foot">
              <span className="muted">~{formatUsd(Number(receive) || 0)}</span>
            </div>
            <div className={`recipient ${manualError ? 'invalid' : ''}`}>
              <label htmlFor="dest-address">Recipient</label>
              <div className="recipient-field">
                <input
                  id="dest-address"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={destination === 'tempo' ? 'Tempo address (0x…)' : 'Solana address'}
                  value={destinationInput}
                  aria-invalid={Boolean(manualError)}
                  aria-describedby="dest-address-help"
                  onChange={(e) => {
                    setDestinationInput(e.target.value)
                    clearQuote()
                  }}
                />
                <button type="button" className="paste" onClick={() => void pasteRecipient()} aria-label="Paste recipient address">
                  <ClipboardPaste size={15} aria-hidden /> Paste
                </button>
              </div>
              {manualError && (
                <small id="dest-address-help" className="field-error">
                  {manualError}
                </small>
              )}
            </div>
          </div>

          <div className="rate-line" aria-live="polite">
            {status.kind === 'loading' ? (
              <span className="muted"><LoaderCircle size={14} className="spin" aria-hidden /> Fetching best price…</span>
            ) : rate !== undefined ? (
              <>
                <span>
                  1 {input.symbol} = {rate.toFixed(6)} {output.symbol}
                </span>
                <button type="button" className="icon-btn small" onClick={() => void getQuote()} aria-label="Refresh quote" disabled={busy}>
                  <RefreshCw size={14} aria-hidden />
                </button>
              </>
            ) : (
              <span className="muted">Enter an amount to see the rate</span>
            )}
          </div>

          {status.kind === 'error' && (
            <p className="notice" role="alert">
              <CircleAlert size={16} aria-hidden />
              <span>{status.message}</span>
            </p>
          )}

          <button type="button" className="cta" onClick={action.onClick} disabled={action.disabled}>
            {action.spin && <LoaderCircle size={18} className="spin" aria-hidden />}
            {action.label === 'Connect Wallet' && <Wallet size={18} aria-hidden />}
            {action.label}
          </button>
          {status.kind === 'submitting' && status.message && <p className="cta-note" aria-live="polite">{status.message}</p>}
          {status.kind === 'ready' && !quoteLive && <p className="cta-note">{signingHint}</p>}

          <dl className="details">
            <Detail label="You Receive" value={receive ? `${formatAmount(receive, 4)} ${output.symbol}` : '—'} />
            <Detail label="Network Fee" value={networkFeeUsd !== undefined ? formatUsd(networkFeeUsd)! : hopQuotes.length ? 'Included' : '—'} />
            <Detail label="Total Cost" value={costPct !== undefined ? `${costPct < 0.01 ? '<0.01' : costPct.toFixed(2)}%` : '—'} />
            <Detail label="Estimated Delivery" value={deliverySeconds ? `~${deliverySeconds}s` : '—'} />
          </dl>
        </section>
      </main>

      <footer className="foot">
        <span>{APP_VERSION}</span>
        <span className="sep">|</span>
        <span className={`health ${apiState}`}>
          <i aria-hidden /> {apiState === 'live' ? 'Live' : apiState === 'checking' ? 'Checking…' : 'Degraded'}
        </span>
        <span className="sep">|</span>
        <span>Non-custodial</span>
      </footer>

      {panel && (
        <div className="overlay" role="presentation" onClick={(e) => e.target === e.currentTarget && setPanel(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="panel-title">
            <button type="button" className="icon-btn modal-close" onClick={() => setPanel(null)} aria-label="Close">
              <X size={18} aria-hidden />
            </button>
            {panel === 'about' ? (
              <>
                <h2 id="panel-title">About Tempo ⇌ Solana</h2>
                <p className="muted">Move stablecoins between Tempo and Solana. Funds go straight from your wallet to the recipient. Nothing is held in between.</p>
                <ol className="steps">
                  <li><b>Connect</b><span>The wallet you are sending from.</span></li>
                  <li><b>Enter</b><span>An amount and the recipient address.</span></li>
                  <li><b>Confirm</b><span>Approve the swap in your wallet.</span></li>
                  <li><b>Receive</b><span>Funds arrive in seconds.</span></li>
                </ol>
              </>
            ) : (
              <>
                <h2 id="panel-title">My History</h2>
                {history.length === 0 ? (
                  <p className="empty-state"><History size={20} aria-hidden /> No swaps yet on this device.</p>
                ) : (
                  <ul className="history">
                    {history.map((item) => (
                      <li key={item.tx}>
                        <div>
                          <strong>
                            {formatAmount(item.sent)} {item.sentSymbol} → {item.received ? formatAmount(item.received) : '—'} {item.receivedSymbol}
                          </strong>
                          <small>
                            {networkName(item.from)} → {networkName(item.to)} · {new Date(item.at).toLocaleString()}
                          </small>
                        </div>
                        <a target="_blank" rel="noreferrer" href={explorerFor(item.from, item.tx)} aria-label="View transaction">
                          <ExternalLink size={16} aria-hidden />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {successOpen && status.kind === 'submitted' && (
        <div className="overlay" role="presentation">
          <div className="modal success" role="dialog" aria-modal="true" aria-labelledby="success-title">
            <button type="button" className="icon-btn modal-close" onClick={() => setSuccessOpen(false)} aria-label="Close">
              <X size={18} aria-hidden />
            </button>
            <svg className="success-check" viewBox="0 0 56 56" aria-hidden="true" focusable="false">
              <circle cx="28" cy="28" r="26" />
              <path d="M17 29 l8 8 l14 -16" />
            </svg>
            <h2 id="success-title">Swap submitted</h2>
            <p className="muted">
              {formatAmount(amount)} {input.symbol} → {receive ? formatAmount(receive) : '—'} {output.symbol}
            </p>
            {status.reference && (
              <a className="link" target="_blank" rel="noreferrer" href={explorerFor(origin, status.reference)}>
                View transaction <ExternalLink size={13} aria-hidden />
              </a>
            )}
            <button type="button" className="cta" onClick={() => { setSuccessOpen(false); reset() }}>
              Start a new swap
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function explorerFor(network: Network, hash: string) {
  if (network === 'solana') return `https://solscan.io/tx/${hash}`
  return `https://explore.mainnet.tempo.xyz/tx/${hash}`
}

type WalletSide = {
  wallet: DynamicWallet | null
  wallets: DynamicWallet[]
  connect: () => void
  select: (walletId: string) => Promise<void>
  disconnect: (walletId: string) => Promise<void>
}

function avatarFor(address: string) {
  let h = 0
  for (const ch of address) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const a = h % 360
  return `linear-gradient(135deg, hsl(${a} 85% 60%), hsl(${(a + 70) % 360} 85% 55%))`
}

function WalletButton({ origin, tempo, solana }: { origin: Direction; tempo: WalletSide; solana: WalletSide }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)
  const sides = { tempo, solana }
  const primary = sides[origin].wallet ?? tempo.wallet ?? solana.wallet
  if (!primary) {
    return (
      <button type="button" className="wallet-btn connect" onClick={() => sides[origin].connect()}>
        <Wallet size={16} aria-hidden /> <span>Connect</span>
      </button>
    )
  }
  return (
    <div className="wallet-wrap" ref={ref}>
      <button type="button" className="wallet-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="avatar" style={{ background: avatarFor(primary.address) }} aria-hidden />
        <span>{compactAddress(primary.address)}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div className="popover wallet-pop" role="menu">
          {(['tempo', 'solana'] as const).map((network) => {
            const side = sides[network]
            return (
              <div className="wallet-group" key={network}>
                <small>
                  <NetworkLogo network={network} className="net-tag-logo" /> {networkName(network)}
                </small>
                {side.wallets.map((wallet) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={wallet.id}
                    aria-current={wallet.address === side.wallet?.address ? 'true' : undefined}
                    onClick={() => {
                      setOpen(false)
                      void side.select(wallet.id)
                    }}
                  >
                    <span className="avatar sm" style={{ background: avatarFor(wallet.address) }} aria-hidden />
                    {compactAddress(wallet.address)}
                    {wallet.address === side.wallet?.address && <Check size={14} aria-hidden />}
                  </button>
                ))}
                {side.wallet ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    onClick={() => {
                      setOpen(false)
                      void side.disconnect(side.wallet!.id)
                    }}
                  >
                    Disconnect {networkName(network)}
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false)
                      side.connect()
                    }}
                  >
                    <Wallet size={14} aria-hidden /> Connect {networkName(network)}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
