/** The sending dashboard's mark: Coldbrew's disc and sun-yellow signal, with three outbound lanes in place of its
 * rings, one dot leaving on the middle lane. It follows the theme through the --logo-* tokens. */
export function DispatchMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="15" fill="var(--logo-disc)" />
      <circle cx="16" cy="16" r="14.25" fill="none" stroke="var(--logo-ring-outer)" strokeWidth="0.75" opacity="0.6" />
      <path d="M8 11.5h11M8 16h13M8 20.5h9" stroke="var(--logo-ring)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="24.25" cy="16" r="2.25" fill="var(--logo-dot)" />
    </svg>
  )
}
