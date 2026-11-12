import { Pill, type PillTone } from "@/components/status"
import type { CompanySource, PipelineStatus } from "@/lib/api"

const STATUS: Record<PipelineStatus, { label: string; tone: PillTone }> = {
  found: { label: "To research", tone: "info" },
  review: { label: "To approve", tone: "warning" },
  qualified: { label: "Qualified", tone: "positive" },
  not_fit: { label: "Not a fit", tone: "negative" },
  error: { label: "Couldn't finish", tone: "warning" },
}

export function StatusPill({ status }: { status: PipelineStatus }) {
  const s = STATUS[status]
  return <Pill tone={s.tone}>{s.label}</Pill>
}

export const SOURCE_NAME: Record<CompanySource, string> = { lead_intel: "Lead Intel", apollo: "Apollo", google_maps: "Google Maps", linkedin: "LinkedIn" }

export function SourcePill({ source }: { source: CompanySource }) {
  return <Pill tone={source === "lead_intel" ? "info" : "neutral"}>{SOURCE_NAME[source]}</Pill>
}
