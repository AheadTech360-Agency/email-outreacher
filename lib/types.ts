export type Source = "linkedin" | "instagram" | "facebook" | "website"

export const SOURCES: Source[] = ["linkedin", "instagram", "facebook", "website"]


export type MediaType = "text" | "image" | "video" | "carousel" | "article" | "page"

/** Which text a Lead Intel ICP rule reads. Empty `sources` means all of them. */
export type IcpSource =
  | "business_name"
  | "website_text"
  | "website_domain"
  | "instagram_bio"
  | "instagram_category"
  | "instagram_handle"
  | "meta_ads_text"

/**
 * An ICP. The ICP itself lives in Lead Intel and is shared by both projects: every field in the first
 * block is Lead Intel's, read-only here. The second block is this workspace's outreach settings for
 * it, saved in outreach.eo_icp_profiles.
 */
export interface ICP {
  id: string
  // ---- Lead Intel (shared, read-only here) ----
  name: string
  industry: string
  /** Lower is checked first when rules overlap. */
  priority: number
  enabled: boolean
  sources: IcpSource[]
  anyOf: string[]
  noneOf: string[]
  websiteAnyOf: string[]
  instagramAnyOf: string[]
  /** false: any filled-in group may match. true: every filled-in group must. */
  requireAll: boolean
  minFollowers: number | null
  maxFollowers: number | null
  /** What Lead Intel searches Google Maps with. */
  searchTerms: string[]
  requiresWebsite: boolean
  minReviews: number | null
  places: string[]
  /** Contactable businesses Lead Intel has matched to it. */
  companyCount: number
  // ---- Outreach settings (this workspace) ----
  description: string
  /** Who to write to at each company. */
  titles: string[]
  pains: string
  offer: string
  proof: string
  cta: string
  tone: string
  wordsToAvoid: string
  hookGuidance: string
  /** Lead analysis: whose posts are read for the opening line (source ids from /sources). */
  enabledSources: string[]
  /** Verification: what research reads to decide whether a business is worth contacting (source ids). */
  verificationSources: string[]
  /** Lead analysis limits for this ICP; null means the workspace setting in Settings. */
  postsPerSource: number | null
  maxPostAgeDays: number | null
  /** What we sell to this ICP (a product's id), or null. */
  productId: string | null
  /** null = use the default company verification template */
  verifyPromptId: string | null
  /** null = use the default hook template */
  hookPromptId: string | null
  /** null = use the default email template */
  emailPromptId: string | null
  createdAt: string
  updatedAt: string
}

/** The outreach half of an ICP: what this app can change. */
export type IcpOutreach = Pick<
  ICP,
  | "description"
  | "titles"
  | "pains"
  | "offer"
  | "proof"
  | "cta"
  | "tone"
  | "wordsToAvoid"
  | "hookGuidance"
  | "enabledSources"
  | "verificationSources"
  | "postsPerSource"
  | "maxPostAgeDays"
  | "productId"
  | "verifyPromptId"
  | "hookPromptId"
  | "emailPromptId"
>

export type LeadStatus =
  | "imported"
  | "enriching"
  | "enriched"
  | "no_content"
  | "generated"
  | "approved"
  | "sent"
  | "skipped"
  | "failed"

export const LEAD_STATUSES: LeadStatus[] = [
  "imported",
  "enriching",
  "enriched",
  "no_content",
  "generated",
  "approved",
  "sent",
  "skipped",
  "failed",
]

export interface Lead {
  id: string
  icpId: string
  firstName: string
  lastName: string
  email: string
  company: string
  title: string
  website: string
  linkedinUrl: string
  instagramUrl: string
  facebookUrl: string
  extra: Record<string, string>
  status: LeadStatus
  /** The Email Scoring prompt's verdict on the lead's current draft; null until it has one. */
  score: LeadScore | null
  /** As reported by Apollo or the CSV: verified, likely, unverified… null when unknown. */
  emailStatus: string | null
  /** How many of their own posts are stored. */
  postCount: number
  createdAt: string
}

export interface LeadScore {
  /** 0 to 100 */
  value: number
  reasons: string[]
}

export interface EnrichmentItem {
  id: string
  leadId: string
  source: Source
  url: string
  postedAt: string
  text: string
  mediaType: MediaType
}

export type PromptKind = "verify" | "hook" | "email" | "score" | "followup2" | "followup3"

export interface PromptTemplate {
  id: string
  name: string
  kind: PromptKind
  isDefault: boolean
  currentVersionId: string
}

export interface PromptVersion {
  id: string
  templateId: string
  version: number
  systemPrompt: string
  userPrompt: string
  model: string
  temperature: number
  maxTokens: number
  /** Hook and email prompts: how many of the newest posts {{items}} holds. null means 15. */
  maxPosts: number | null
  note: string
  createdAt: string
}

export type GenerationStatus = "draft" | "edited" | "approved" | "sent" | "skipped"

export type GenerationFlag =
  | "sensitive_topic"
  | "repost"
  | "old_content"
  | "thin_material"
  | "no_hook"
  | "not_scored"
  | "risky_email"
  | "website_email"

export interface Settings {
  defaultModel: string
  postsPerLead: number
  maxPostAgeDays: number
  monthlyBudgetUsd: number
  scoring: ScoringSettings
}

export interface ScoringSettings {
  /** Scoring template; null uses the default scoring template. */
  promptId: string | null
  /** Leads scoring at or above this are sent automatically (when autoSend is on). */
  threshold: number
  autoSend: boolean
  /** Most emails auto-sent per day; the rest wait in review. */
  dailyAutoSendCap: number
}

export type Role = "sales" | "management" | "admin"

export const ROLES: Role[] = ["sales", "management", "admin"]

export type UserStatus = "active" | "invited" | "deactivated"

export interface User {
  id: string
  name: string
  email: string
  role: Role
  workspaceIds: string[]
  status: UserStatus
  /** null until they first sign in. */
  lastActiveAt: string | null
  createdAt: string
}

export interface Workspace {
  id: string
  name: string
  description: string
  createdAt: string
}

/** An ICP as Lead Intel defines it. Read-only here. */
export interface LeadIntelIcp {
  id: string
  name: string
  industry: string
}


/** A business from Lead Intel, in the shape the backend's /companies endpoint returns. */
export interface Company {
  id: string
  name: string
  city: string | null
  state: string | null
  icpId: string | null
  icpName: string | null
  /** 1 (best) to 4; null when Lead Intel couldn't score it. */
  tier: number | null
  problemScore: number | null
  /** Lead Intel's verdict, e.g. has_website, social_only, no_website, dead, unclear. */
  websiteStatus: string | null
  websiteUrl: string | null
  domain: string | null
  instagram: {
    handle: string | null
    url: string | null
    followers: number | null
    category: string | null
    bio: string | null
  }
}
