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

export default function RoutePath({ from, to, phase }: Props) {
  const label = phaseLabel(phase, nameOf(from), nameOf(to))
  const animating = isAnimatingPhase(phase)
  const status = phase === 'error' ? 'Unavailable' : phase === 'loading' ? 'Finding route' : phase === 'submitting' ? 'Signing' : phase === 'submitted' ? 'Submitted' : phase === 'ready' ? 'Ready' : 'Across'
  return (
    <div className="route-preview" data-phase={phase}>
      <div className="route-preview-head">
        <span className="route-end">
          <ChainLogo chain={from} />
          {nameOf(from)}
        </span>
        <span className="route-status" role="img" aria-label={label}>{status}</span>
        <span className="route-end route-end-to">
          {nameOf(to)}
          <ChainLogo chain={to} />
        </span>
      </div>
      <div className="route-track-row" aria-hidden="true">
        <i className="route-dot" />
        <i className={animating ? 'route-track is-animating' : 'route-track'} />
        <b className="route-provider">Across</b>
        <i className={animating ? 'route-track is-animating' : 'route-track'} />
        <i className="route-dot" />
      </div>
      <p className="route-caption">{phase === 'idle' ? 'Preview route' : label}</p>
    </div>
  )
}
