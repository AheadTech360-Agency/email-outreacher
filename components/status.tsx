import type { ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FLAG_LABEL, GENERATION_STATUS_LABEL, LEAD_STATUS_COLOR, LEAD_STATUS_LABEL } from "@/lib/format"
import { PIPELINE_STAGES, leadCount, pipelineOf } from "@/lib/selectors"
import { cn } from "@/lib/utils"
import type { GenerationFlag, GenerationStatus, LeadStatus } from "@/lib/types"

export type PillTone = "neutral" | "info" | "positive" | "warning" | "negative"

const PILL: Record<PillTone, string> = {
  neutral: "bg-pill-neutral text-pill-neutral-ink",
  info: "bg-pill-info text-pill-info-ink",
  positive: "bg-pill-positive text-pill-positive-ink",
  warning: "bg-pill-warning text-pill-warning-ink",
  negative: "bg-pill-negative text-pill-negative-ink",
}

/** Pale tint with dark ink of the same hue. Never squeezed by its column. */
export function Pill({ tone = "neutral", children, className }: { tone?: PillTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 flex-none items-center rounded-[4px] px-1.5 text-xs font-medium whitespace-nowrap",
        PILL[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px]">
      <span className={cn("size-2 flex-none rounded-full", LEAD_STATUS_COLOR[status])} />
      {LEAD_STATUS_LABEL[status]}
    </span>
  )
}

const GEN_TONE: Record<GenerationStatus, PillTone> = {
  draft: "neutral",
  edited: "neutral",
  approved: "positive",
  sent: "info",
  skipped: "neutral",
}

export function GenerationStatusBadge({ status }: { status: GenerationStatus }) {
  return (
    <Pill tone={GEN_TONE[status]} className={status === "skipped" ? "bg-transparent px-0 text-muted-foreground" : ""}>
      {GENERATION_STATUS_LABEL[status]}
    </Pill>
  )
}

/** The pipeline of one ICP: approved, waiting for review, ready to draft, not enriched yet, dropped. */
export function PipelineStrip({ statuses, className, legend = true }: { statuses: Partial<Record<LeadStatus, number>>; className?: string; legend?: boolean }) {
  const counts = pipelineOf(statuses)
  const total = leadCount(statuses)
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-muted">
        {total > 0 &&
          PIPELINE_STAGES.filter((s) => counts[s.key] > 0).map((s) => (
            <Tooltip key={s.key}>
              <TooltipTrigger asChild>
                <div className={cn("h-full first:rounded-l-full last:rounded-r-full", s.swatch)} style={{ width: `${(counts[s.key] / total) * 100}%` }} />
              </TooltipTrigger>
              <TooltipContent>
                {s.label}: {counts[s.key]}
              </TooltipContent>
            </Tooltip>
          ))}
      </div>
      {legend && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {PIPELINE_STAGES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 whitespace-nowrap">
              <span className={cn("size-2 rounded-full", s.swatch)} />
              {s.label}
              <span className={cn("tabular-nums", counts[s.key] ? "text-foreground" : "")}>{counts[s.key]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Confidence is the review queue's main figure, so it carries the data hue. */
export function ConfidenceBadge({ value }: { value: number }) {
  const low = value < 60
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="h-1 w-10 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className={cn("block h-full rounded-full", low ? "bg-warning" : "bg-data")} style={{ width: `${value}%` }} />
      </span>
      <span className={cn("w-6 text-right text-[13px] tabular-nums", low ? "text-warning" : "text-foreground")}>{value}</span>
    </span>
  )
}

export function RelevanceDots({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-[3px]" aria-label={`Relevance ${value} of 5`} title={`Relevance ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={cn("size-1.5 rounded-full", n <= value ? "bg-foreground/75" : "bg-foreground/12")} />
      ))}
    </span>
  )
}

export function FlagBadges({ flags }: { flags: GenerationFlag[] }) {
  if (flags.length === 0) return <span className="text-muted-foreground">–</span>
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <Pill key={f} tone={f === "sensitive_topic" ? "negative" : "warning"}>
          {FLAG_LABEL[f]}
        </Pill>
      ))}
    </div>
  )
}

export function NoHookBadge() {
  return <Pill>No hook</Pill>
}

/** AI lead score with a tick at the auto-send threshold. At or above it carries the data hue. */
export function ScoreBadge({ value, threshold }: { value: number | null | undefined; threshold: number }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">–</span>
  const above = value >= threshold
  return (
    <span
      className="inline-flex items-center justify-end gap-2"
      title={above ? `At or above the threshold of ${threshold}` : `Below the threshold of ${threshold}`}
    >
      <span className="relative h-1.5 w-12 rounded-full bg-muted" aria-hidden>
        <span className={cn("absolute inset-y-0 left-0 rounded-full", above ? "bg-data" : "bg-data-mid/60")} style={{ width: `${value}%` }} />
        <span className="absolute -top-0.5 -bottom-0.5 w-px bg-foreground/60" style={{ left: `${threshold}%` }} />
      </span>
      <span className={cn("w-6 text-right text-[13px] tabular-nums", above ? "font-medium text-foreground" : "text-muted-foreground")}>
        {value}
      </span>
    </span>
  )
}
