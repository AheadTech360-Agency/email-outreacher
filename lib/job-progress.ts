import type { Job } from "./api"

export function jobPercent(job: Pick<Job, "status" | "done" | "total">): number | null {
  if (job.status === "done") return 100
  if (!job.total || job.total <= 0 || !Number.isFinite(job.total)) return null
  return Math.min(100, Math.max(0, Math.round((job.done || 0) / job.total * 100)))
}

export function jobDestination(kind: string): string {
  if (kind.startsWith("/analysis")) return "/analysis"
  if (kind.startsWith("/products")) return "/products"
  if (kind.startsWith("/pipeline")) return "/companies"
  if (kind.startsWith("/stakeholders") || kind.startsWith("/posts") || kind.startsWith("/emails")) return "/people"
  if (kind.startsWith("/sending")) return "/mailboxes"
  if (kind.startsWith("/smart-lists")) return "/smart-lists"
  if (kind.startsWith("/improve")) return "/feedback"
  return "/home"
}
