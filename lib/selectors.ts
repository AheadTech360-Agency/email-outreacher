import type { ICP, Lead, LeadStatus, PromptKind, PromptTemplate, PromptVersion } from "./types"

export function resolveTemplate(
  templates: PromptTemplate[],
  icp: Pick<ICP, "verifyPromptId" | "hookPromptId" | "emailPromptId">,
  kind: PromptKind,
): PromptTemplate | undefined {
  const id = kind === "verify" ? icp.verifyPromptId : kind === "hook" ? icp.hookPromptId : kind === "email" ? icp.emailPromptId : null
  return templates.find((t) => t.id === id) ?? templates.find((t) => t.kind === kind && t.isDefault)
}

export function currentVersion(versions: PromptVersion[], template: PromptTemplate | undefined) {
  return template ? versions.find((v) => v.id === template.currentVersionId) : undefined
}

/** ICPs that use a template, explicitly or through the default. */
export function icpsUsingTemplate(icps: ICP[], template: PromptTemplate): ICP[] {
  return icps.filter((icp) => {
    if (!isIcpPromptKind(template.kind)) return false
    const id = icp[ICP_PROMPT_FIELD[template.kind]]
    return id === template.id || (id === null && template.isDefault)
  })
}

export const ENRICHABLE: LeadStatus[] = ["imported", "failed", "no_content"]
export const GENERATABLE: LeadStatus[] = ["enriched", "no_content", "generated", "skipped"]

export type PipelineStage = "approved" | "review" | "ready" | "pending" | "dropped"

/** Pipeline order, strongest first. One hue ramp for progress, grey for what left the pipeline. */
export const PIPELINE_STAGES: { key: PipelineStage; label: string; swatch: string }[] = [
  { key: "approved", label: "Approved or sent", swatch: "bg-data" },
  { key: "review", label: "To review", swatch: "bg-data-mid" },
  { key: "ready", label: "Ready to draft", swatch: "bg-data-soft" },
  { key: "pending", label: "Not enriched", swatch: "bg-foreground/15" },
  { key: "dropped", label: "Skipped or failed", swatch: "bg-foreground/35" },
]

const STAGE_OF: Record<LeadStatus, PipelineStage> = {
  approved: "approved",
  sent: "approved",
  generated: "review",
  enriched: "ready",
  no_content: "ready",
  imported: "pending",
  enriching: "pending",
  skipped: "dropped",
  failed: "dropped",
}

export function pipeline(leads: Lead[]): Record<PipelineStage, number> {
  const counts: Record<PipelineStage, number> = { approved: 0, review: 0, ready: 0, pending: 0, dropped: 0 }
  for (const l of leads) counts[STAGE_OF[l.status]]++
  return counts
}

/** Leads per status (from the backend's summary), as pipeline stages. */
export function pipelineOf(statuses: Partial<Record<LeadStatus, number>>): Record<PipelineStage, number> {
  const counts: Record<PipelineStage, number> = { approved: 0, review: 0, ready: 0, pending: 0, dropped: 0 }
  for (const [status, n] of Object.entries(statuses)) if (STAGE_OF[status as LeadStatus]) counts[STAGE_OF[status as LeadStatus]] += n ?? 0
  return counts
}

/** How many leads, from per-status counts; with `only`, just those statuses. */
export function leadCount(statuses: Partial<Record<LeadStatus, number>>, only?: LeadStatus[]): number {
  return Object.entries(statuses).reduce((sum, [s, n]) => (only && !only.includes(s as LeadStatus) ? sum : sum + (n ?? 0)), 0)
}

/** The scoring template in use (Settings), falling back to the default scoring template. */
export function resolveScoringTemplate(templates: PromptTemplate[], scoring: { promptId: string | null }) {
  return templates.find((t) => t.id === scoring.promptId && t.kind === "score") ?? templates.find((t) => t.kind === "score" && t.isDefault)
}

/** The ICP field holding its choice for each prompt kind an ICP picks. Email scoring is chosen in Settings. */
export const ICP_PROMPT_FIELD = {
  verify: "verifyPromptId",
  hook: "hookPromptId",
  email: "emailPromptId",
} as const satisfies Partial<Record<PromptKind, keyof ICP>>

export type IcpPromptKind = keyof typeof ICP_PROMPT_FIELD

/** Scoring is chosen in Settings and the follow-ups always use their default, so only these are picked per ICP. */
export function isIcpPromptKind(kind: PromptKind): kind is IcpPromptKind {
  return kind in ICP_PROMPT_FIELD
}

/** Follow-up prompts: every ICP uses the default one. */
export const FOLLOWUP_KINDS: PromptKind[] = ["followup2", "followup3", "followup4", "followup5"]
