import type { Source } from "./types"

// What fetching posts costs on Apify, per post, at the actors' published rates: about $2 per 1,000
// LinkedIn posts and up to $2.70 per 1,000 Instagram posts. Facebook isn't fetched yet; websites
// are read for free during company research.

export const COST_PER_POST: Record<Source, number> = {
  linkedin: 0.002,
  instagram: 0.0027,
  facebook: 0,
  website: 0,
}

/** The sources Enrich actually fetches. */
export const FETCHED_SOURCES = ["linkedin", "instagram"] as const

export function costPerLeadForSource(source: Source, postsPerLead: number): number {
  return COST_PER_POST[source] * postsPerLead
}

/** The most fetching posts can cost a lead: company LinkedIn, their LinkedIn and the company's Instagram, each read
 * in full. Usually far less: it stops at the first source Claude finds enough in, and posts already stored are free. */
export function postsCeiling(leads: number, perSource: number, sources: readonly ("linkedin" | "instagram")[]): number {
  const linkedin = sources.includes("linkedin") ? 2 * COST_PER_POST.linkedin : 0
  const instagram = sources.includes("instagram") ? COST_PER_POST.instagram : 0
  return leads * perSource * (linkedin + instagram) + leads * 0.0006 // and Claude's check after each source
}

/** What a fetch says, from its results. */
export function postsSummary(results: { enough: boolean; new: number; stoppedAt: string | null }[]): string {
  const enough = results.filter((r) => r.enough).length
  const by = (stage: string) => results.filter((r) => r.stoppedAt === stage).length
  const parts = [
    by("company_linkedin") && `${by("company_linkedin")} from the company's LinkedIn`,
    by("person_linkedin") && `${by("person_linkedin")} from their own LinkedIn`,
    by("company_instagram") && `${by("company_instagram")} from the company's Instagram`,
  ].filter(Boolean)
  return `Enough to write with for ${enough} of ${results.length}${parts.length ? ` (${parts.join(", ")})` : ""}.`
}