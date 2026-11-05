import type { EmailDraft } from "./api"

export interface FeedbackFilters {
  query: string
  hook: string
  tag: string
  score: string
  sort: string
}

export function filterFeedback(emails: EmailDraft[], filters: FeedbackFilters, icpNames: Map<string, string>, tagLabels: Record<string, string> = {}): EmailDraft[] {
  const terms = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matching = emails.filter((d) => {
    const text = [d.subject, d.body, d.lead.firstName, d.lead.lastName, d.lead.email, d.lead.title,
      d.lead.company, d.hook, d.feedback?.note, ...(d.feedback?.tags ?? []).map((tag) => tagLabels[tag] ?? tag.replaceAll("_", " ")), d.lead.icpId ? icpNames.get(d.lead.icpId) : "No ICP"]
      .filter(Boolean).join(" ").toLowerCase()
    return terms.every((term) => text.includes(term)) &&
      (filters.hook === "all" || (filters.hook === "with" ? !!d.hook : !d.hook)) &&
      (filters.tag === "all" || !!d.feedback?.tags.includes(filters.tag as NonNullable<EmailDraft["feedback"]>["tags"][number])) &&
      (filters.score === "all" || (filters.score === "unscored" ? d.score === null : d.score !== null &&
        (filters.score === "low" ? d.score < 60 : filters.score === "high" ? d.score >= 80 : d.score >= 60 && d.score < 80)))
  })
  return matching.sort((a, b) => {
    if (filters.sort === "score-low" || filters.sort === "score-high") {
      if (a.score === null || b.score === null) return a.score === b.score ? 0 : a.score === null ? 1 : -1
      return filters.sort === "score-low" ? a.score - b.score : b.score - a.score
    }
    if (filters.sort === "rated") return (b.feedback?.updatedAt ?? "").localeCompare(a.feedback?.updatedAt ?? "")
    return filters.sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)
  })
}
