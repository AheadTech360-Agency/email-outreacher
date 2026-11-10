/** The sign-in picture: mail leaving on lanes, one per mailbox. Each lane's dots travel out once on load and settle
 * where they are; the lead dot carries Coldbrew's sun yellow. Static for anyone who prefers reduced motion. */
const LANES = [
  { y: 70, dots: [0.22, 0.48, 0.71] },
  { y: 120, dots: [0.3, 0.58, 0.86] },
  { y: 170, dots: [0.16, 0.42, 0.64, 0.93] },
  { y: 220, dots: [0.35, 0.61, 0.79] },
  { y: 270, dots: [0.26, 0.52, 0.74] },
]

export function DispatchLanes() {
  let n = 0
  return (
    <svg viewBox="0 0 400 340" className="h-auto w-full max-w-[460px]" aria-hidden>
      {LANES.map((lane, li) => (
        <g key={lane.y}>
          <line x1="24" x2="376" y1={lane.y} y2={lane.y} className="lane-line" style={{ ["--i" as string]: li }} />
          {lane.dots.map((at) => {
            const lead = li === 2 && at === 0.93
            const i = n++
            return (
              <circle
                key={at}
                cx={24 + at * 352}
                cy={lane.y}
                r={lead ? 5 : 3}
                className={lead ? "lane-dot lane-dot-lead" : "lane-dot"}
                style={{ ["--i" as string]: i, ["--from" as string]: `${-at * 352}px` }}
              />
            )
          })}
        </g>
      ))}
    </svg>
  )
}
