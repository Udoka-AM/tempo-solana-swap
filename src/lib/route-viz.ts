export type RoutePhase = 'idle' | 'loading' | 'ready' | 'submitting' | 'submitted' | 'error'

export function phaseLabel(phase: RoutePhase, origin: string, destination: string) {
  switch (phase) {
    case 'loading':
      return `Fetching live Across quote from ${origin} to ${destination}`
    case 'ready':
      return `Live route ready from ${origin} to ${destination} via Across`
    case 'submitting':
      return `Waiting for wallet signature on ${origin}`
    case 'submitted':
      return `Deposit submitted on ${origin}, Across is delivering to ${destination}`
    case 'error':
      return `Route unavailable from ${origin} to ${destination}`
    default:
      return `Route from ${origin} to ${destination} via Across`
  }
}

export function isAnimatingPhase(phase: RoutePhase) {
  return phase === 'loading' || phase === 'submitting'
}
