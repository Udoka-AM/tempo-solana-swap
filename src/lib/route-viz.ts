export type RoutePhase = 'idle' | 'loading' | 'ready' | 'submitting' | 'submitted' | 'error'

export function corridorLabel(origin: string, destination: string) {
  return `${origin} → Base → ${destination}`
}

export function phaseLabel(phase: RoutePhase, origin: string, destination: string) {
  switch (phase) {
    case 'loading':
      return `Fetching live Across quotes for ${corridorLabel(origin, destination)}`
    case 'ready':
      return `Live route ready on ${corridorLabel(origin, destination)} via Across`
    case 'submitting':
      return `Waiting for wallet signature on ${origin}`
    case 'submitted':
      return `Deposits submitted on ${origin} and Base, Across is delivering to ${destination}`
    case 'error':
      return `Route unavailable on ${corridorLabel(origin, destination)}`
    default:
      return `Route on ${corridorLabel(origin, destination)} via Across`
  }
}

export function isAnimatingPhase(phase: RoutePhase) {
  return phase === 'loading' || phase === 'submitting'
}
