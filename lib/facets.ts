export function hasValue(value: unknown): boolean { return typeof value === "string" ? !!value.trim() : !!value }
export function presenceMatches(value: unknown, filter = "all"): boolean { return filter === "all" || (filter === "yes" ? hasValue(value) : !hasValue(value)) }
export function scoreMatches(score: number | null | undefined, filter = "all"): boolean {
  if (filter === "all") return true
  if (filter === "unscored") return score == null
  if (score == null || !Number.isFinite(score)) return false
  return filter === "low" ? score < 60 : filter === "medium" ? score >= 60 && score < 80 : filter === "high" ? score >= 80 : false
}
export function textMatches(query: string | undefined, ...values: unknown[]): boolean {
  const terms = (query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean)
  const haystack = values.filter((v) => v != null).join(" ").toLowerCase()
  return terms.every((term) => haystack.includes(term))
}
export function recentMatches(date: string | null | undefined, days = "all", now = Date.now()): boolean {
  if (days === "all") return true
  if (!date) return false
  const time = Date.parse(date), limit = Number(days)
  return Number.isFinite(time) && limit > 0 && time <= now && time >= now - limit * 86400000
}
export function choices(values: (string | null | undefined)[]): { value: string; label: string }[] {
  return [...new Set(values.filter((v): v is string => typeof v === "string" && !!v.trim()))].sort((a,b) => a.localeCompare(b)).map((value) => ({ value, label: value }))
}
export function pickFacets(values: Record<string, string>, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.filter((key) => typeof values[key] === "string").map((key) => [key, values[key]]))
}
export const PRESENCE_OPTIONS = [{value:"yes",label:"Has"},{value:"no",label:"Missing"}]
export const SCORE_OPTIONS = [{value:"low",label:"Below 60"},{value:"medium",label:"60-79"},{value:"high",label:"80 and above"},{value:"unscored",label:"Not scored"}]
export const RECENT_OPTIONS = [{value:"7",label:"Last 7 days"},{value:"30",label:"Last 30 days"},{value:"90",label:"Last 90 days"}]
