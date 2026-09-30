import { isAnimatingPhase, phaseLabel, type RoutePhase } from '../lib/route-viz'

type Props = {
  origin: string
  destination: string
  phase: RoutePhase
}

// High-definition SVG route: Tempo node -> Across bridge path -> Solana node.
// Crisp at any DPR (vector, non-scaling stroke), functional motion only:
// the packet travels while loading/submitting, the trail solidifies on ready.
export default function RoutePath({ origin, destination, phase }: Props) {
  const label = phaseLabel(phase, origin, destination)
  const active = phase === 'ready' || phase === 'submitted'
  const failed = phase === 'error'
  const animating = isAnimatingPhase(phase)
  return (
    <div className="route-viz" data-phase={phase}>
      <svg viewBox="0 0 640 120" role="img" aria-label={label} focusable="false" aria-hidden={false}>
        <defs>
          <linearGradient id="route-trail" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--ink)" stopOpacity="0.9" />
            <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--ink)" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        {/* faint station grid */}
        <g className="route-grid" aria-hidden="true">
          {Array.from({ length: 16 }, (_, i) => (
            <circle key={i} cx={20 + i * 40} cy={60} r={1.2} />
          ))}
        </g>
        {/* base track */}
        <path
          id="route-track"
          d="M72 60 C 200 60, 240 60, 320 60 S 440 60, 568 60"
          fill="none"
          stroke="var(--line-soft)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        />
        {/* live trail */}
        <path
          className={animating ? 'route-trail is-animating' : 'route-trail'}
          d="M72 60 C 200 60, 240 60, 320 60 S 440 60, 568 60"
          fill="none"
          stroke={failed ? 'var(--line-soft)' : 'url(#route-trail)'}
          strokeWidth={active || animating ? 2.5 : 2}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeDasharray={active ? 'none' : '7 7'}
          opacity={phase === 'idle' ? 0.55 : 1}
        />
        {/* travelling packet */}
        {animating && !failed && (
          <circle r={6} className="route-packet" fill="var(--accent)" stroke="var(--bg)" strokeWidth={2}>
            <animateMotion dur={phase === 'loading' ? '2.2s' : '1.4s'} repeatCount="indefinite" rotate="0">
              <mpath href="#route-track" />
            </animateMotion>
          </circle>
        )}
        {active && <circle cx={568} cy={60} r={5} className="route-arrived" fill="var(--accent)" />}
        {/* origin node */}
        <g className={`route-node ${phase !== 'idle' && !failed ? 'is-live' : ''}`}>
          <circle cx={72} cy={60} r={16} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <circle cx={72} cy={60} r={5} fill="var(--ink)" />
        </g>
        {/* across relay node */}
        <g className={`route-node ${animating || active ? 'is-live' : ''}`}>
          <rect x={306} y={46} width={28} height={28} rx={6} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <path d="M313 60 h14 M320 53 v14" stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </g>
        {/* destination node */}
        <g className={`route-node ${active ? 'is-live' : ''}`}>
          <circle cx={568} cy={60} r={16} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <circle cx={568} cy={60} r={5} fill={active ? 'var(--accent)' : 'var(--muted)'} />
        </g>
        <text x={72} y={102} textAnchor="middle" className="route-caption">
          {origin}
        </text>
        <text x={320} y={102} textAnchor="middle" className="route-caption">
          ACROSS
        </text>
        <text x={568} y={102} textAnchor="middle" className="route-caption">
          {destination}
        </text>
      </svg>
      <div className="route-meta" aria-hidden="true">
        <span>{origin}</span>
        <b>{failed ? 'NO LIVE ROUTE' : active ? 'LIVE QUOTE' : animating ? 'FETCHING…' : 'ACROSS'}</b>
        <span>{destination}</span>
      </div>
    </div>
  )
}
