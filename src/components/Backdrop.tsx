import { useEffect, useState } from 'react'

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduced
}

// Ambient backdrop: two faint bezier corridors drifting behind the content.
// Decorative only (aria-hidden), slow functional-feeling motion, fully static
// under prefers-reduced-motion.
export default function Backdrop() {
  const reduced = useReducedMotion()
  return (
    <div className="ambient" aria-hidden="true">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" focusable="false">
        <g className="ambient-grid">
          {Array.from({ length: 24 }, (_, row) =>
            Array.from({ length: 12 }, (_, col) => (
              <circle key={`${row}-${col}`} cx={60 + col * 120} cy={60 + row * 36} r={1.1} />
            )),
          )}
        </g>
        <path
          id="ambient-a"
          className={reduced ? '' : 'ambient-drift'}
          d="M-40 620 C 280 560, 420 340, 720 340 S 1160 340, 1480 220"
          fill="none"
        />
        <path
          id="ambient-b"
          className={reduced ? '' : 'ambient-drift slow'}
          d="M-40 720 C 320 680, 520 480, 820 470 S 1180 460, 1480 360"
          fill="none"
        />
        {!reduced && (
          <>
            <circle r={5} className="ambient-packet">
              <animateMotion dur="14s" repeatCount="indefinite" rotate="0">
                <mpath href="#ambient-a" />
              </animateMotion>
            </circle>
            <circle r={4} className="ambient-packet alt">
              <animateMotion dur="19s" repeatCount="indefinite" rotate="0">
                <mpath href="#ambient-b" />
              </animateMotion>
            </circle>
          </>
        )}
      </svg>
    </div>
  )
}
