import type { SenderStatus } from "@/lib/config-api"
import { cn } from "@/lib/utils"

const LOOK: Record<SenderStatus, { label: string; className: string }> = {
  ok: { label: "Connected", className: "bg-pill-positive text-pill-positive-ink" },
  failed: { label: "Can't connect", className: "bg-pill-negative text-pill-negative-ink" },
  untested: { label: "Not tested", className: "bg-pill-warning text-pill-warning-ink" },
  paused: { label: "Paused", className: "bg-pill-neutral text-pill-neutral-ink" },
}

export const statusLabel = (status: SenderStatus) => LOOK[status].label

export function SenderStatusPill({ status, className }: { status: SenderStatus; className?: string }) {
  const look = LOOK[status]
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap", look.className, className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {look.label}
    </span>
  )
}
