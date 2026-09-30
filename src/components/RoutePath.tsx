import { Fragment } from 'react'
import { NetworkBase, NetworkSolana, NetworkTempo } from '@web3icons/react'
import { isAnimatingPhase, phaseLabel, type RoutePhase } from '../lib/route-viz'

type Props = {
  from: 'tempo' | 'solana'
  to: 'tempo' | 'solana'
  phase: RoutePhase
}

type Chain = 'tempo' | 'base' | 'solana'

function ChainLogo({ chain }: { chain: Chain }) {
  if (chain === 'tempo') return <NetworkTempo className="chain-logo" aria-hidden />
  if (chain === 'base') return <NetworkBase className="chain-logo" aria-hidden />
  return <NetworkSolana className="chain-logo" aria-hidden />
}

function nameOf(chain: Chain) {
  return chain === 'tempo' ? 'Tempo' : chain === 'base' ? 'Base' : 'Solana'
}

export default function RoutePath({ from, to, phase }: Props) {
  const label = phaseLabel(phase, nameOf(from), nameOf(to))
  const animating = isAnimatingPhase(phase)
  const status = phase === 'error' ? 'Unavailable' : phase === 'loading' ? 'Finding route' : phase === 'submitting' ? 'Signing' : phase === 'submitted' ? 'Submitted' : phase === 'ready' ? 'Ready' : '2 hops · Across'
  const nodes: Chain[] = from === 'tempo' ? ['tempo', 'base', 'solana'] : ['solana', 'base', 'tempo']
  return (
    <div className="route-preview" data-phase={phase}>
      <div className="route-preview-head">
        <span className="route-kicker">ROUTE</span>
        <span className="route-status" role="img" aria-label={label}>{status}</span>
        <span className="route-kicker route-kicker-right">VIA BASE</span>
      </div>
      <div className="route-track-row" aria-label={label}>
        {nodes.map((chain, index) => (
          <Fragment key={chain}>
            <span className={chain === 'base' ? 'route-node route-node-base' : 'route-node'}>
              <ChainLogo chain={chain} />
              <span>{nameOf(chain)}</span>
            </span>
            {index < nodes.length - 1 && (
              <span className="route-leg">
                <i className={animating ? 'route-track is-animating' : 'route-track'} />
                <b className="route-provider">Across</b>
              </span>
            )}
          </Fragment>
        ))}
      </div>
      <p className="route-caption">{phase === 'idle' ? 'Preview route' : label}</p>
    </div>
  )
}
