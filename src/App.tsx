import { useMemo, useState } from 'react'
import { DynamicWidget, useDynamicContext, useUserWallets } from '@dynamic-labs/sdk-react-core'
import { tokenIcons } from '@web3icons/react'
import { ArrowDown, ArrowUpRight, Check, CircleAlert, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'
import { assetsFor, findAsset, isSupportedPair, type Asset, type AssetId, type Network } from '../shared/assets'
import { compactAddress, formatAmount, fromAtomicAmount } from './lib/format'
import { requestQuote, type AcrossQuote } from './lib/quote'
import { executeEvmQuote, executeSolanaQuote, type ExecutionUpdate } from './lib/transactions'

const TokenUSDC = tokenIcons.TokenUSDC
const TokenSOL = tokenIcons.TokenSOL
type Status = { kind: 'idle' | 'loading' | 'ready' | 'error' | 'submitting' | 'submitted'; message?: string; reference?: string }

function Icon({ asset }: { asset: Asset }) {
  if (asset.id === 'USDC') return <TokenUSDC className="token" />
  if (asset.id === 'SOL') return <TokenSOL className="token" />
  return <i className="token token-text">{asset.symbol[0]}</i>
}

function AssetPicker({ assets, value, onChange }: { assets: Asset[]; value: AssetId; onChange: (id: AssetId) => void }) {
  const asset = assets.find((entry) => entry.id === value) ?? assets[0]
  return <label className="asset-picker"><Icon asset={asset} /><select value={value} onChange={(event) => onChange(event.target.value as AssetId)} aria-label="Choose token">{assets.map((entry) => <option value={entry.id} key={entry.id}>{entry.symbol}</option>)}</select></label>
}

export default function App() {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const userWallets = useUserWallets()
  const [origin, setOrigin] = useState<Network>('tempo')
  const [inputId, setInputId] = useState<AssetId>('pathUSD')
  const [outputId, setOutputId] = useState<AssetId>('USDC')
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<AcrossQuote>()
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [review, setReview] = useState(false)
  const destination: Network = origin === 'tempo' ? 'solana' : 'tempo'
  const input = findAsset(origin, inputId)!
  const output = findAsset(destination, outputId)!
  const wallets = useMemo(() => ({ tempo: userWallets.find((wallet) => wallet.address.startsWith('0x')), solana: userWallets.find((wallet) => !wallet.address.startsWith('0x')) }), [userWallets])
  const originWallet = primaryWallet && (origin === 'tempo' ? primaryWallet.address.startsWith('0x') : !primaryWallet.address.startsWith('0x')) ? primaryWallet : wallets[origin]
  const recipient = wallets[destination]
  const supported = isSupportedPair(origin, input.id, destination, output.id)
  const receive = quote?.expectedOutputAmount ? fromAtomicAmount(quote.expectedOutputAmount, output.decimals) : undefined

  function changeOrigin(next: Network) {
    setOrigin(next); setInputId(next === 'tempo' ? 'pathUSD' : 'USDC'); setOutputId(next === 'tempo' ? 'USDC' : 'pathUSD'); setQuote(undefined); setStatus({ kind: 'idle' })
  }
  async function getQuote() {
    if (!originWallet || !recipient) return setStatus({ kind: 'error', message: 'Connect an EVM wallet and a Solana wallet first.' })
    setStatus({ kind: 'loading', message: 'Checking the live Across route…' })
    try { setQuote(await requestQuote({ origin, destination, input, output, amount, depositor: originWallet.address, recipient: recipient.address })); setStatus({ kind: 'ready', message: 'Route ready for review.' }); setReview(true) }
    catch (error) { setQuote(undefined); setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Quote unavailable.' }) }
  }
  async function submit() {
    if (!quote || !originWallet) return
    const update: ExecutionUpdate = (stage, reference) => setStatus({ kind: stage === 'submitted' ? 'submitted' : 'submitting', reference, message: { switching: 'Switching wallet to Tempo…', approving: 'Approval requested in wallet…', submitting: 'Review and sign in your wallet…', submitted: 'Submitted. Across is delivering the route.' }[stage] })
    try { setReview(false); if (origin === 'tempo') await executeEvmQuote(originWallet as never, quote, update); else await executeSolanaQuote(originWallet as never, quote, update) }
    catch (error) { setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Transaction was not submitted.' }) }
  }
  return <main id="top">
    <header className="shell header"><a href="#top" className="wordmark">TEMPO<span>×</span>SOLANA</a><div><b className="online">● LIVE ROUTES</b><a href="#process">PROCESS</a><DynamicWidget buttonClassName="dynamic-button" innerButtonComponent={<><Wallet size={15} /> CONNECT</>} /></div></header>
    <section className="shell intro"><div><p className="kicker">STABLECOIN CORRIDOR / 01</p><h1>One deliberate route<br />between <em>Tempo</em> and Solana.</h1><p>Move a supported stablecoin through a live Across quote. Your external wallet approves every transaction; this app never holds keys or submits automatically.</p></div><aside><small>RELEASE SCOPE</small><strong>pathUSD / USDC.e <b>↔</b> USDC</strong><span>Tempo 4217 · Solana mainnet</span></aside></section>
    <section className="shell connected"><WalletCard chain="TEMPO · 4217" address={wallets.tempo?.address} /><ArrowUpRight /><WalletCard chain="SOLANA · MAINNET" address={wallets.solana?.address} /></section>
    <section className="shell grid">
      <div className="swap-card"><div className="card-top"><b>ROUTE BUILDER</b><button onClick={() => { setAmount(''); setQuote(undefined); setStatus({ kind: 'idle' }) }}><RefreshCw size={14} /> RESET</button></div>
        <div className="chain-tabs"><button className={origin === 'tempo' ? 'selected' : ''} onClick={() => changeOrigin('tempo')}>FROM TEMPO</button><button className={origin === 'solana' ? 'selected' : ''} onClick={() => changeOrigin('solana')}>FROM SOLANA</button></div>
        <label>YOU SEND</label><div className="amount"><input inputMode="decimal" aria-label="Amount to send" placeholder="0.00" value={amount} onChange={(e) => { setAmount(e.target.value); setQuote(undefined) }} /><AssetPicker value={inputId} assets={assetsFor(origin).filter((entry) => entry.bridgeable)} onChange={setInputId} /></div><small>Sender: {compactAddress(originWallet?.address)} · wallet provider reads balances on connection.</small>
        <div className="divider"><span /><ArrowDown size={18} /><span /></div><label>YOU RECEIVE</label><div className="receive"><strong>{receive ? formatAmount(receive) : '—'}</strong><AssetPicker value={outputId} assets={assetsFor(destination).filter((entry) => entry.bridgeable)} onChange={setOutputId} /></div><small>{quote ? 'Expected output from the live Across quote.' : 'Request a quote to calculate the received amount.'}</small>
        <div className="route"><span>{origin.toUpperCase()}</span><b>ACROSS / LIVE QUOTE</b><span>{destination.toUpperCase()}</span></div>
        {status.kind === 'error' && <p className="notice error"><CircleAlert size={16} />{status.message}</p>}{status.kind === 'submitted' && <p className="notice success"><Check size={16} />{status.message} {status.reference && <a target="_blank" rel="noreferrer" href={origin === 'tempo' ? `https://explore.tempo.xyz/tx/${status.reference}` : `https://solscan.io/tx/${status.reference}`}>VIEW <ExternalLink size={12} /></a>}</p>}
        <button className="primary" disabled={!supported || !amount || status.kind === 'loading' || status.kind === 'submitting'} onClick={getQuote}>{status.kind === 'loading' ? <><LoaderCircle className="spin" size={16} /> CHECKING ROUTE</> : originWallet && recipient ? 'REVIEW LIVE ROUTE' : 'CONNECT BOTH WALLETS'}</button>{(!originWallet || !recipient) && <button className="link-button" onClick={() => setShowAuthFlow(true)}>Connect external wallets <ArrowUpRight size={14} /></button>}
      </div>
      <aside className="details"><h2>ROUTE DETAILS <ShieldCheck size={16} /></h2><Row label="Route" value={supported ? `${input.symbol} → ${output.symbol}` : 'Unavailable'} /><Row label="Provider" value="Across" /><Row label="Relay fee" value={quote?.totalRelayFee?.total ? `${formatAmount(fromAtomicAmount(quote.totalRelayFee.total, input.decimals))} ${input.symbol}` : 'In live quote'} /><Row label="Delivery" value={quote?.expectedFillTime ? `~${quote.expectedFillTime} seconds` : 'In live quote'} /><div><b>Before you sign</b><p>Check the amount, recipient, route and fee in your wallet. A fresh quote is required if it expires.</p></div></aside>
    </section>
    <section id="process" className="shell process"><p className="kicker">HOW IT WORKS / 02</p><div><Step n="01" t="Connect" d="Link external EVM and Solana wallets with Dynamic." /><Step n="02" t="Quote" d="Pages Functions obtain a supported short-lived Across route." /><Step n="03" t="Sign" d="Your wallet approves and submits the bridge deposit." /><Step n="04" t="Receive" d="Track the submitted route through delivery." /></div></section>
    {review && quote && <div className="backdrop"><section className="review" role="dialog" aria-modal="true" aria-label="Review transaction"><div className="card-top"><b>REVIEW TRANSACTION</b><button onClick={() => setReview(false)}>CANCEL</button></div><h2>{formatAmount(amount)} {input.symbol} <ArrowUpRight size={17} /> {receive ? formatAmount(receive) : '—'} {output.symbol}</h2><Row label="Send from" value={compactAddress(originWallet?.address)} /><Row label="Receive at" value={compactAddress(recipient?.address)} /><Row label="Fee" value={quote.totalRelayFee?.total ? `${formatAmount(fromAtomicAmount(quote.totalRelayFee.total, input.decimals))} ${input.symbol}` : 'Included in quote'} /><p className="notice"><CircleAlert size={16} />No transaction has been submitted. The next step opens your wallet.</p><button className="primary" onClick={submit}>SIGN IN WALLET</button></section></div>}
    <footer className="shell"><span>TEMPO × SOLANA SWAP</span><span>NON-CUSTODIAL · STABLECOIN-ONLY</span><a target="_blank" rel="noreferrer" href="https://github.com/Udoka-AM/tempo-solana-swap">SOURCE <ArrowUpRight size={13} /></a></footer>
  </main>
}
function WalletCard({ chain, address }: { chain: string; address?: string }) { return <article className="wallet-card"><small>{chain}</small><strong>{address ? compactAddress(address) : 'NOT CONNECTED'}</strong><span>{address ? 'External wallet connected' : 'Connect an external wallet'}</span></article> }
function Row({ label, value }: { label: string; value: string }) { return <p className="row"><span>{label}</span><strong>{value}</strong></p> }
function Step({ n, t, d }: { n: string; t: string; d: string }) { return <article><small>{n}</small><h2>{t}</h2><p>{d}</p></article> }
