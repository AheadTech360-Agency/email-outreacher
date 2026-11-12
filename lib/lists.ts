// Paginated lists: the backend filters, counts and pages them, so a page reads only the rows it shows (every row read
// is database egress). Filters are sent as query parameters with the same values the pages always used.
import { type ApiLead, type EmailDraft, type EmailStatus, type PipelineCompany, type PipelineStatus, type Stakeholder, api, toLead, useApi } from "./api"
import type { Lead, LeadStatus } from "./types"

/** Query string from filters: empty values are left out ("all" is sent, the backend treats it as no filter). */
export function query(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== "") p.set(key, String(value))
  const s = p.toString()
  return s ? `?${s}` : ""
}

const paging = (page: number, pageSize: number) => ({ limit: pageSize, offset: (page - 1) * pageSize })

// ---------- Companies ----------

export interface CompanyFilters {
  icpId?: string
  archive: string
  status: string
  q?: string
  source?: string
  location?: string
  website?: string
  contacts?: string
  scoreBand?: string
  icpState?: string
}

export interface CompanyRow extends PipelineCompany {
  peopleCount: number
}

export interface CompaniesPage {
  items: CompanyRow[]
  total: number
  counts: Partial<Record<"all" | PipelineStatus, number>>
  sources: string[]
}

/** What selecting a company and the bulk actions read. */
export interface CompanyBrief {
  id: string
  status: PipelineStatus
  source: PipelineCompany["source"]
  researchedAt: string | null
  name: string
  domain: string | null
}

export const fetchCompaniesPage = (wsId: string, f: CompanyFilters, page: number, pageSize: number) =>
  api<CompaniesPage>(`/pipeline/companies/page${query({ ...f, ...paging(page, pageSize) })}`, { workspaceId: wsId })

export const fetchMatchingCompanies = (wsId: string, f: CompanyFilters) =>
  api<CompanyBrief[]>(`/pipeline/companies/matching${query({ ...f })}`, { workspaceId: wsId, fresh: true })

export const fetchLeadIntelIdsInPipeline = (wsId: string) => api<string[]>("/pipeline/companies/lead-intel-ids", { workspaceId: wsId })

// ---------- People ----------

export interface PeopleFilters {
  archive: string
  q?: string
  foundBy?: string
  status?: string
  email?: string
  linkedin?: string
  postState?: string
  emailState?: string
  companyText?: string
  pipelineCompanyId?: string
}

export interface PersonRow extends Stakeholder {
  companyName: string
  postCount: number
}

export interface PeoplePage {
  items: PersonRow[]
  total: number
  /** Everyone before search and filters (the archive filter only). */
  baseTotal: number
  emailStatuses: string[]
}

/** What selecting a person and the People page's bulk actions read. */
export interface PersonBrief {
  id: string
  email: string | null
  revealedAt: string | null
  linkedinUrl: string | null
  leadId: string | null
}

export const fetchPeoplePage = (wsId: string, f: PeopleFilters, page: number, pageSize: number) =>
  api<PeoplePage>(`/stakeholders/page${query({ ...f, ...paging(page, pageSize) })}`, { workspaceId: wsId })

export const fetchMatchingPeople = (wsId: string, f: PeopleFilters) =>
  api<PersonBrief[]>(`/stakeholders/matching${query({ ...f })}`, { workspaceId: wsId, fresh: true })

/** Each person's lead, after Add as leads. */
export const fetchPeopleLeadIds = (wsId: string, ids: string[]) =>
  api<Record<string, string | null>>("/stakeholders/lead-ids", { workspaceId: wsId, method: "POST", body: { ids } })

// ---------- Leads ----------

export interface LeadFilters {
  icpId?: string
  status?: string
  source?: string
  email?: string
  linkedin?: string
  posts?: string
  score?: string
  queuedWithin?: string
  q?: string
  /** "false": the search leaves out job titles (an ICP's Leads tab). */
  qTitle?: string
}

export interface LeadsPage {
  items: Lead[]
  total: number
  /** The leads in sequence (in this ICP, or all), whatever the filters. */
  queuedTotal: number
  noEmail: number
  statuses: Partial<Record<LeadStatus, number>>
}

/** What selecting a lead and the Fetch posts and Write emails dialogs read. */
export interface LeadBrief {
  id: string
  icpId: string | null
  status: LeadStatus
  linkedinUrl: string | null
  instagramUrl: string | null
}

/** `scopeIcpId`: the ICP the totals cover (an ICP's Leads tab); without it they cover every ICP. */
export const fetchLeadsPage = async (wsId: string, f: LeadFilters, page: number, pageSize: number, scopeIcpId?: string): Promise<LeadsPage> => {
  const r = await api<Omit<LeadsPage, "items"> & { items: ApiLead[] }>(`/leads/page${query({ ...f, ...paging(page, pageSize), scopeIcpId })}`, { workspaceId: wsId })
  return { ...r, items: r.items.map(toLead) }
}

export const fetchMatchingLeads = (wsId: string, f: LeadFilters) =>
  api<LeadBrief[]>(`/leads/matching${query({ ...f })}`, { workspaceId: wsId, fresh: true })

export const fetchLeadBriefs = (wsId: string, ids: string[]) =>
  ids.length ? api<LeadBrief[]>("/leads/brief", { workspaceId: wsId, method: "POST", body: { ids } }) : Promise.resolve([] as LeadBrief[])

/** Every ICP's leads per status (every lead, queued or not); icpId null is leads with no ICP. */
export const fetchLeadSummary = (wsId: string) =>
  api<{ icpId: string | null; statuses: Partial<Record<LeadStatus, number>> }[]>("/leads/summary", { workspaceId: wsId })

export const fetchLeadExtraKeys = (wsId: string) => api<string[]>("/leads/extra-keys", { workspaceId: wsId })

/** Whether a lead here already has this email. */
export const fetchEmailTaken = (wsId: string, email: string) => api<boolean>(`/leads/email-taken${query({ email })}`, { workspaceId: wsId, fresh: true })

/** Each ICP's leads per status (key "" is leads with no ICP), read again whenever leads change (`version`). */
export function useLeadSummary(wsId: string | null | undefined, version: number) {
  const summary = useApi(() => (wsId ? fetchLeadSummary(wsId) : Promise.resolve([])), [wsId, version])
  const byIcp = new Map((summary.data ?? []).map((row) => [row.icpId ?? "", row.statuses]))
  return { ...summary, of: (icpId: string): Partial<Record<LeadStatus, number>> => byIcp.get(icpId) ?? {} }
}

// ---------- Smart list candidates (the Add dialog) ----------

export interface CandidateFilters {
  kind: "company" | "person"
  listId: string
  icp?: string
  from?: string
  q?: string
  processed?: string
  contacted?: string
  verified?: string
  emails?: string
}

export interface Candidate {
  id: string
  name: string
  detail: string
  icpId: string | null
  /** The list they're in now. */
  listId: string | null
}

export const fetchCandidates = (wsId: string, f: CandidateFilters, page: number, pageSize: number) =>
  api<{ items: Candidate[]; total: number }>(`/smart-lists/candidates${query({ ...f, ...paging(page, pageSize) })}`, { workspaceId: wsId })

export const fetchCandidateIds = (wsId: string, f: CandidateFilters) =>
  api<{ id: string; listId: string | null }[]>(`/smart-lists/candidates/ids${query({ ...f })}`, { workspaceId: wsId, fresh: true })

// ---------- Emails (Review and Feedback) ----------

export interface EmailFilters {
  statuses?: EmailStatus[]
  /** The ICP route's scope: an ICP id, or "none". */
  icpId?: string
  /** The page's ICP filter. */
  icp?: string
  /** Review: the whole text inside any one field. */
  search?: string
  /** Feedback: every word somewhere in the email, its rating, its tags or its ICP's name. */
  terms?: string
  scoreBand?: string
  hook?: string
  flags?: string
  /** Review's rating filter. */
  rating?: string
  /** Feedback's rating tab. */
  rated?: string
  written?: string
  tag?: string
  sort?: string
}

export interface EmailsPage {
  items: EmailDraft[]
  total: number
  /** Under the same search and filters: emails per status (Review's tabs) and per rating (Feedback's tabs). */
  statuses: Partial<Record<EmailStatus, number>>
  ratings: Partial<Record<"unrated" | "good" | "bad", number>>
}

export interface EmailBrief {
  id: string
  status: EmailStatus
  leadName: string
  leadEmail: string | null
  emailStatus: string | null
}

const emailQuery = (f: EmailFilters) => ({ ...f, statuses: f.statuses?.length ? f.statuses.join(",") : undefined })

export const fetchEmailsPage = (wsId: string, f: EmailFilters, page: number, pageSize: number) =>
  api<EmailsPage>(`/emails/page${query({ ...emailQuery(f), ...paging(page, pageSize) })}`, { workspaceId: wsId })

/** Every matching email's id in the page's order (the drawer's previous and next across pages). */
export const fetchEmailIds = (wsId: string, f: EmailFilters) =>
  api<string[]>(`/emails/ids${query(emailQuery(f))}`, { workspaceId: wsId, fresh: true })

export const fetchEmailBriefs = (wsId: string, f: EmailFilters) =>
  api<EmailBrief[]>(`/emails/brief${query(emailQuery(f))}`, { workspaceId: wsId })

/** How many first emails there are (in an ICP, or all) and how many are rated. */
export const fetchRated = (wsId: string, icpId?: string) =>
  api<{ total: number; rated: number }>(`/emails/rated${query({ icpId })}`, { workspaceId: wsId })

/** One email, whatever its status: the open email stays open while it changes. */
export const fetchEmail = (wsId: string, id: string) => api<EmailDraft>(`/emails/${encodeURIComponent(id)}`, { workspaceId: wsId, fresh: true })
