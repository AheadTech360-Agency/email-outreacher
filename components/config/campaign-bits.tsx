"use client"

import { FlaskConical } from "lucide-react"
import type { CampaignStatus, EnrollmentStatus } from "@/lib/config-api"
import { cn } from "@/lib/utils"

const PILL = "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap"

const CAMPAIGN: Record<CampaignStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-pill-neutral text-pill-neutral-ink" },
  active: { label: "Running", className: "bg-pill-positive text-pill-positive-ink" },
  paused: { label: "Paused", className: "bg-pill-warning text-pill-warning-ink" },
  archived: { label: "Archived", className: "bg-pill-neutral text-pill-neutral-ink opacity-70" },
}

export function CampaignStatusPill({ status }: { status: CampaignStatus }) {
  const look = CAMPAIGN[status]
  return (
    <span className={cn(PILL, look.className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {look.label}
    </span>
  )
}

const STOP: Record<string, string> = {
  replied: "Replied",
  bounced: "Bounced",
  unsubscribed: "Unsubscribed",
  manual: "Stopped by hand",
  failed: "Couldn't send",
  do_not_contact: "Do not contact",
}

export function EnrollmentStatusPill({ status, stopReason }: { status: EnrollmentStatus; stopReason: string | null }) {
  const [label, className] =
    status === "active"
      ? ["In sequence", "bg-pill-info text-pill-info-ink"]
      : status === "paused"
        ? ["Paused", "bg-pill-warning text-pill-warning-ink"]
        : status === "completed"
          ? ["Finished", "bg-pill-neutral text-pill-neutral-ink"]
          : stopReason === "replied"
            ? ["Replied", "bg-pill-positive text-pill-positive-ink"]
            : [STOP[stopReason ?? ""] ?? "Stopped", stopReason === "bounced" || stopReason === "failed" ? "bg-pill-negative text-pill-negative-ink" : "bg-pill-neutral text-pill-neutral-ink"]
  return <span className={cn(PILL, className)}>{label}</span>
}

/** "12.5%" of a whole, or a dash when there's nothing to divide by yet. */
export const rate = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(part / whole < 0.1 ? 1 : 0)}%` : "—")

/** Shown while the scheduler only logs (OWN_SENDING_LIVE off): nothing goes out yet. */
export function DryRunBanner({ live }: { live: boolean | undefined }) {
  if (live !== false) return null
  return (
    <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-dashed border-data/40 bg-data-soft/40 px-4 py-3">
      <FlaskConical className="mt-0.5 size-4 flex-none text-data" aria-hidden />
      <p className="text-[13.5px] leading-5">
        <span className="font-medium">Dry run: nothing is sent yet.</span>{" "}
        <span className="text-muted-foreground">
          Running campaigns log each email they would send, under Activity. Turn on OWN_SENDING_LIVE on Railway to send for real.
        </span>
      </p>
    </div>
  )
}
