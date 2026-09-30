import { NetworkSolana, NetworkTempo } from '@web3icons/react'
import { isAnimatingPhase, phaseLabel, type RoutePhase } from '../lib/route-viz'

type Props = {
  from: 'tempo' | 'solana'
  to: 'tempo' | 'solana'
  phase: RoutePhase
}

function ChainLogo({ chain }: { chain: 'tempo' | 'solana' }) {
  return chain === 'tempo' ? (
    <NetworkTempo className="chain-logo" aria-hidden />
  ) : (
    <NetworkSolana className="chain-logo" aria-hidden />
  )
}

function nameOf(chain: 'tempo' | 'solana') {
  return chain === 'tempo' ? 'Tempo' : 'Solana'
}

// Bridge path with the native chain marks on each end. Crisp at any DPR
// (vector, non-scaling stroke) with functional motion only: the packet
// travels while loading/submitting, the trail solidifies on ready.
export default function RoutePath({ from, to, phase }: Props) {
  const label = phaseLabel(phase, nameOf(from), nameOf(to))
  const active = phase === 'ready' || phase === 'submitted'
  const failed = phase === 'error'
  const animating = isAnimatingPhase(phase)
  return (
    <div className="route-viz" data-phase={phase}>
      <div className="route-ends" aria-hidden="true">
        <span className="route-end">
          <ChainLogo chain={from} />
          {nameOf(from).toUpperCase()}
        </span>
        <span className="route-end">
          {nameOf(to).toUpperCase()}
          <ChainLogo chain={to} />
        </span>
      </div>
      <svg viewBox="0 0 640 84" role="img" aria-label={label} focusable="false" aria-hidden={false}>
        <defs>
          <linearGradient id="route-trail" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--ink)" stopOpacity="0.9" />
            <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--ink)" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <g className="route-grid" aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => (
            <circle key={i} cx={20 + i * 40} cy={42} r={1.2} />
          ))}
        </g>
        <path
          id="route-track"
          d="M40 42 C 200 42, 240 42, 320 42 S 480 42, 600 42"
          fill="none"
          stroke="var(--line-soft)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        />
        <path
          className={animating ? 'route-trail is-animating' : 'route-trail'}
          d="M40 42 C 200 42, 240 42, 320 42 S 480 42, 600 42"
          fill="none"
          stroke={failed ? 'var(--line-soft)' : 'url(#route-trail)'}
          strokeWidth={active || animating ? 2.5 : 2}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeDasharray={active ? 'none' : '7 7'}
          opacity={phase === 'idle' ? 0.55 : 1}
        />
        {animating && !failed && (
          <circle r={6} className="route-packet" fill="var(--accent)" stroke="var(--bg)" strokeWidth={2}>
            <animateMotion dur={phase === 'loading' ? '2.2s' : '1.4s'} repeatCount="indefinite" rotate="0">
              <mpath href="#route-track" />
            </animateMotion>
          </circle>
        )}
        {active && <circle cx={600} cy={42} r={5} className="route-arrived" fill="var(--accent)" />}
        <circle cx={40} cy={42} r={6} fill="var(--ink)" aria-hidden="true" />
        <circle cx={320} cy={42} r={4} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" aria-hidden="true" />
        <circle cx={600} cy={42} r={6} fill={active ? 'var(--accent)' : 'var(--ink)'} aria-hidden="true" />
      </svg>
      <div className="route-meta" aria-hidden="true">
        <span>{nameOf(from).toUpperCase()}</span>
        <b>{failed ? 'NO LIVE ROUTE' : active ? 'LIVE ROUTE' : animating ? 'FINDING…' : 'ACROSS'}</b>
        <span>{nameOf(to).toUpperCase()}</span>
      </div>
    </div>
  )
}
