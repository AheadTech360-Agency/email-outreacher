import type { EnrichmentItem, ICP, Lead, PromptKind } from "./types"

// Real, client-side prompt rendering. No eval: placeholders are looked up in a flat map.

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g

const ICP_VARS = [
  "icp.name",
  "icp.titles",
  "icp.industry",
  "icp.places",
  "icp.pains",
  "icp.offer",
  "icp.proof",
  "icp.cta",
  "icp.tone",
  "icp.wordsToAvoid",
  "icp.hookGuidance",
]

/** The person the email goes to: the lead, plus the record they were found or added as. */
const LEAD_VARS = [
  "lead.firstName",
  "lead.lastName",
  "lead.fullName",
  "lead.title",
  "lead.seniority",
  "lead.headline",
  "lead.location",
  "lead.company",
  "lead.website",
  "lead.linkedinUrl",
  "lead.instagramUrl",
  "lead.experience",
  "lead.about",
]

/** Posts, numbered once: {{items}} is all of them; the others are parts of it with the same numbers. */
const POST_VARS = ["items", "posts.linkedin", "posts.instagram"]

/** The ranked hooks from Hook Selection, and the top one the email opens with. */
const HOOK_VARS = ["hooks", "hook.text", "hook.summary", "hook.post", "hook.source", "hook.url", "hook.date"]

/** Emails rated on the Feedback page for the same ICP. */
/** Example emails from the library for the lead's ICP, then emails rated on the Feedback page. */
const EXAMPLE_VARS = ["examples.samples", "examples.good", "examples.bad"]

/** Old names that still work in saved prompts but aren't offered any more. */
const ALIASES: Partial<Record<PromptKind, string[]>> = {
  email: ["icp.exampleEmail"],
  score: ["icp.exampleEmail"],
}

const EMAIL_VARS = ["email.subject", "email.body"]

/** Follow-ups are written later, from what the lead was already sent. */
const FOLLOWUP_VARS = [
  "lead.firstName",
  "lead.lastName",
  "lead.fullName",
  "lead.title",
  "lead.company",
  "lead.website",
  "icp.name",
  "icp.pains",
  "icp.offer",
  "icp.proof",
  "icp.cta",
  "icp.tone",
  "icp.wordsToAvoid",
  "hooks",
  "hook.text",
  "examples.samples",
  "email1.subject",
  "email1.body",
  "email2.body",
  "email3.body",
  "email4.body",
  "followup.step",
]

/** LinkedIn and Instagram campaign messages: written when due, from the lead and what this campaign already sent. */
const SOCIAL_VARS = [
  ...FOLLOWUP_VARS.filter((v) => !v.startsWith("email") && v !== "followup.step" && v !== "hook.text"),
  "social.step",
  "social.earlier",
]
const SOCIAL_KINDS: PromptKind[] = ["linkedin_invite", "linkedin_message", "instagram_message"]

/**
 * What we know about the lead's company, filled by the backend: our research for Apollo companies,
 * Lead Intel's stored data for Lead Intel ones. company.summary is Company Verification's verdict.
 */
const COMPANY_VARS = [
  "company.name",
  "company.domain",
  "company.location",
  "company.socials",
  "company.website",
  "company.instagram",
  "company.posts",
  "company.apollo",
]

/** The ICP's product (Products page), filled by the backend. Empty when the ICP has none. */
const PRODUCT_VARS = [
  "product.name",
  "product.description",
  "product.value",
  "product.proof",
  "product.offer",
  "product.cta",
  "product.url",
  "product.notes",
  "product.details",
  "product.custom.<field>",
]

/** Company Verification prompts are filled by the backend from a researched company. */
const VERIFY_VARS = [
  "icp.name",
  "icp.industry",
  "icp.places",
  "icp.description",
  "icp.pains",
  "icp.offer",
  "icp.rules",
  ...COMPANY_VARS,
  ...PRODUCT_VARS,
]

/** Sorting prompts are filled by the backend, 25 companies or people at a time (services/smart_lists.py). */
const SORT_VARS = ["sort.icps", "sort.lists", "sort.items"]

/** Variables offered in the editor sidebar for each prompt kind. `lead.extra.*` is matched by prefix. */
export function availableVariables(kind: PromptKind): string[] {
  if (kind === "analysis") return ["analysis.data"]
  if (kind === "product") return ["product.data", ...PRODUCT_VARS]
  if (kind === "verify") return VERIFY_VARS
  if (kind === "sort") return SORT_VARS
  if (kind === "sort_people") return ["sort.lists", "sort.items"]
  if (kind.startsWith("followup")) return [...FOLLOWUP_VARS, ...PRODUCT_VARS]
  if (SOCIAL_KINDS.includes(kind)) return [...SOCIAL_VARS, ...PRODUCT_VARS]
  const person = [...ICP_VARS, ...LEAD_VARS, "lead.extra.<column>", ...POST_VARS, ...COMPANY_VARS, "company.summary", ...PRODUCT_VARS]
  if (kind === "hook") return person
  if (kind === "email") return [...person, ...HOOK_VARS, ...EXAMPLE_VARS]
  // Email scoring sees the draft too.
  return [...person, ...HOOK_VARS, ...EXAMPLE_VARS, ...EMAIL_VARS]
}

export function isKnownVariable(name: string, kind: PromptKind): boolean {
  if (kind !== "analysis" && kind !== "sort" && kind !== "sort_people" && /^product\.custom\.[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(name)) return true
  if (kind !== "analysis" && kind !== "product" && kind !== "sort" && kind !== "sort_people" && kind !== "verify" && !kind.startsWith("followup") && !SOCIAL_KINDS.includes(kind) && name.startsWith("lead.extra.") && name.length > "lead.extra.".length) return true
  return availableVariables(kind).includes(name) || (ALIASES[kind] ?? []).includes(name)
}

export function extractVariables(template: string): string[] {
  return Array.from(template.matchAll(PLACEHOLDER), (m) => m[1])
}

export function unknownVariables(template: string, kind: PromptKind): string[] {
  return Array.from(new Set(extractVariables(template).filter((v) => !isKnownVariable(v, kind))))
}

export interface HookContext {
  /** The opening sentence. */
  text: string
  source: string
  url: string
  date: string
  summary: string
  /** The full text of the chosen post. */
  post: string
}

export interface RenderContext {
  icp: ICP
  lead: Lead
  items?: EnrichmentItem[]
  hook?: HookContext | null
  /** The drafted email, for the scoring prompt. */
  email?: { subject: string; body: string } | null
}

export function formatItems(items: EnrichmentItem[]): string {
  if (items.length === 0) return "(no content found)"
  return items
    .map((it, i) => `${i + 1}. [${it.source}, ${it.postedAt.slice(0, 10)}] ${it.text}`)
    .join("\n")
}

export function buildVariables(ctx: RenderContext): Record<string, string> {
  const { icp, lead, items = [], hook, email } = ctx
  const vars: Record<string, string> = {
    "icp.name": icp.name,
    "icp.titles": icp.titles.join(", "),
    "icp.industry": icp.industry,
    "icp.places": icp.places.join(", "),
    "icp.pains": icp.pains,
    "icp.offer": icp.offer,
    "icp.proof": icp.proof,
    "icp.cta": icp.cta,
    "icp.tone": icp.tone,
    "icp.wordsToAvoid": icp.wordsToAvoid,
    "icp.hookGuidance": icp.hookGuidance,
    "lead.firstName": lead.firstName,
    "lead.lastName": lead.lastName,
    "lead.company": lead.company,
    "lead.title": lead.title,
    "lead.website": lead.website,
    items: formatItems(items),
    "hook.text": hook?.text ?? "",
    "hook.source": hook?.source ?? "",
    "hook.url": hook?.url ?? "",
    "hook.date": hook?.date ?? "",
    "hook.summary": hook?.summary ?? "",
    "hook.post": hook?.post ?? "",
    "email.subject": email?.subject ?? "",
    "email.body": email?.body ?? "",
  }
  for (const [k, v] of Object.entries(lead.extra)) vars[`lead.extra.${k}`] = v
  return vars
}

/** Unknown variables render as empty strings. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (_, name: string) => vars[name] ?? "")
}
