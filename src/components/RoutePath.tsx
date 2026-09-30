import { isAnimatingPhase, phaseLabel, type RoutePhase } from '../lib/route-viz'

type Props = {
  stations: [string, string, string]
  phase: RoutePhase
}

// High-definition SVG route: origin -> Base proxy -> destination, bridged by
// Across across two hops. Crisp at any DPR (vector, non-scaling stroke) with
// functional motion only: the packet travels while loading/submitting, the
// trail solidifies on ready.
const X = [72, 320, 568]
const TRACK = `M${X[0]} 60 C 150 60, 170 60, ${X[1]} 60 S 470 60, ${X[2]} 60`

export default function RoutePath({ stations, phase }: Props) {
  const label = `${phaseLabel(phase, stations[0], `${stations[2]} via ${stations[1]}`)}: hop 1 ${stations[0]} to ${stations[1]}, hop 2 ${stations[1]} to ${stations[2]}`
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
          d={TRACK}
          fill="none"
          stroke="var(--line-soft)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        />
        {/* live trail */}
        <path
          className={animating ? 'route-trail is-animating' : 'route-trail'}
          d={TRACK}
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
        {active && <circle cx={X[2]} cy={60} r={5} className="route-arrived" fill="var(--accent)" />}
        {/* station nodes */}
        {X.map((x, index) => (
          <g key={stations[index]} className={`route-node ${phase !== 'idle' && !failed ? 'is-live' : ''}`}>
            <circle cx={x} cy={60} r={16} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            <circle cx={x} cy={60} r={5} fill={index === 2 && active ? 'var(--accent)' : 'var(--ink)'} />
          </g>
        ))}
        {/* proxy marker */}
        <g aria-hidden="true">
          <rect x={X[1] - 14} y={22} width={28} height={16} rx={4} fill="var(--ink)" />
          <text x={X[1]} y={34} textAnchor="middle" className="route-proxy">
            PROXY
          </text>
        </g>
        <text x={X[0]} y={102} textAnchor="middle" className="route-caption">
          {stations[0]}
        </text>
        <text x={X[1]} y={102} textAnchor="middle" className="route-caption">
          {stations[1]}
        </text>
        <text x={X[2]} y={102} textAnchor="middle" className="route-caption">
          {stations[2]}
        </text>
      </svg>
      <div className="route-meta" aria-hidden="true">
        <span>HOP 1 · {stations[0]} → {stations[1]}</span>
        <b>{failed ? 'NO LIVE ROUTE' : active ? 'LIVE 2-HOP QUOTE' : animating ? 'FETCHING…' : 'ACROSS ×2'}</b>
        <span>HOP 2 · {stations[1]} → {stations[2]}</span>
      </div>
    </div>
  )
}
