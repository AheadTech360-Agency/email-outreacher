"use client"

import { useCallback, useEffect, useState } from "react"
import { api } from "./api"

// The sending dashboard's calls (/config): sender accounts and personas. Requests go through Coldbrew's own api(),
// so they carry the same session and reach the same backend.

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong."
}

/** Load on mount and whenever `deps` change; `reload` loads again, keeping what's shown meanwhile. */
export function useApi<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    load()
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e: unknown) => live && setState((s) => ({ data: s.data, error: errorText(e), loading: false })))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }))
    setTick((t) => t + 1)
  }, [])
  return { ...state, reload, setData: (data: T) => setState({ data, error: null, loading: false }) }
}

// ---------- Who's signed in ----------

export type { Role } from "./types"

export interface Workspace {
  id: string
  name: string
}

export const fetchWorkspaces = () => api<Workspace[]>("/workspaces")
export const canManage = (role: string | undefined) => role === "admin" || role === "management"
// ---------- Sender accounts ----------

export type Security = "ssl" | "starttls"
export type SenderStatus = "untested" | "ok" | "failed" | "paused"

export interface Sender {
  id: string
  label: string
  fromName: string
  fromEmail: string
  provider: string
  personaId: string | null
  personaName: string | null
  smtpHost: string
  smtpPort: number
  smtpSecurity: Security
  smtpUsername: string
  smtpPasswordSet: boolean
  imapHost: string | null
  imapPort: number | null
  imapSecurity: Security | null
  imapUsername: string | null
  imapPasswordSet: boolean
  dailyLimit: number
  sentToday: number
  status: SenderStatus
  lastCheckedAt: string | null
  lastError: string | null
  createdAt: string
}

export interface SenderInput {
  label: string
  fromName: string
  fromEmail: string
  provider: string
  personaId: string | null
  smtpHost: string
  smtpPort: number
  smtpSecurity: Security
  smtpUsername: string
  smtpPassword: string | null
  imapHost: string | null
  imapPort: number | null
  imapSecurity: Security | null
  imapUsername: string | null
  imapPassword: string | null
  dailyLimit: number
}

export interface TestResult {
  ok: boolean
  smtpError: string | null
  imapError: string | null
  imapChecked: boolean
  account: Sender
}

export const fetchSenders = (ws: string) => api<Sender[]>("/senders", { workspaceId: ws })
export const addSender = (ws: string, body: SenderInput) => api<Sender>("/senders", { workspaceId: ws, method: "POST", body })
export const editSender = (ws: string, id: string, body: SenderInput) => api<Sender>(`/senders/${id}`, { workspaceId: ws, method: "PUT", body })
export const pauseSender = (ws: string, id: string, paused: boolean) =>
  api<Sender>(`/senders/${id}/status`, { workspaceId: ws, method: "PATCH", body: { paused } })
export const testSender = (ws: string, id: string) => api<TestResult>(`/senders/${id}/test`, { workspaceId: ws, method: "POST" })
export const deleteSender = (ws: string, id: string) => api<void>(`/senders/${id}`, { workspaceId: ws, method: "DELETE" })

// ---------- Personas ----------

export interface Persona {
  id: string
  name: string
  title: string
  signature: string
  senders: number
  createdAt: string
}

export type PersonaInput = Pick<Persona, "name" | "title" | "signature">

export const fetchPersonas = (ws: string) => api<Persona[]>("/personas", { workspaceId: ws })
export const addPersona = (ws: string, body: PersonaInput) => api<Persona>("/personas", { workspaceId: ws, method: "POST", body })
export const editPersona = (ws: string, id: string, body: PersonaInput) =>
  api<Persona>(`/personas/${id}`, { workspaceId: ws, method: "PUT", body })
export const deletePersona = (ws: string, id: string) => api<void>(`/personas/${id}`, { workspaceId: ws, method: "DELETE" })

// ---------- Campaigns (Coldbrew's own sending) ----------

export type CampaignStatus = "draft" | "active" | "paused" | "archived"

export interface Schedule {
  timezone: string
  start: string
  end: string
  /** 1 is Monday, 7 is Sunday. */
  days: number[]
}

export interface Step {
  id?: string
  stepOrder?: number
  delayDays: number
  threadMode: "new" | "reply"
  subject: string
  body: string
}

export interface CampaignStats {
  leads: number
  active: number
  completed: number
  stopped: number
  sent: number
  dryRuns: number
  failed: number
  replies: number
  bounces: number
  unsubscribes: number
}

export interface Campaign {
  id: string
  name: string
  /** The ICP this campaign is for: every enabled ICP has one. null for one made by hand. */
  icpId: string | null
  icpName: string | null
  status: CampaignStatus
  schedule: Schedule
  steps: Step[]
  stats: CampaignStats
  createdAt: string
  updatedAt: string
}

export interface CampaignInput {
  name: string
  schedule: Schedule
  steps: Step[]
}

export type EnrollmentStatus = "active" | "paused" | "completed" | "stopped"

export interface Enrollment {
  id: string
  leadId: string
  name: string
  email: string | null
  company: string
  sender: string | null
  status: EnrollmentStatus
  stopReason: string | null
  nextStepOrder: number
  nextRunAt: string | null
  sent: number
  lastActivityAt: string | null
  createdAt: string
}

export interface Candidate {
  id: string
  name: string
  email: string
  company: string
  hasFirstEmail: boolean
}

export type ActivityKind = "sent" | "dry_run" | "failed" | "skipped" | "reply" | "bounce" | "unsubscribe" | "auto_reply"

export interface Activity {
  id: string
  kind: ActivityKind
  at: string
  campaignId: string | null
  campaign: string | null
  leadId: string | null
  leadName: string
  leadEmail: string
  mailbox: string | null
  subject: string
  detail: string
}

export interface SendingStatus {
  live: boolean
  variables: Record<string, string>
}

export const fetchSendingStatus = () => api<SendingStatus>("/own-sending/status")
export const fetchCampaigns = (ws: string) => api<Campaign[]>("/campaigns", { workspaceId: ws })
export const fetchCampaign = (ws: string, id: string) => api<Campaign>(`/campaigns/${id}`, { workspaceId: ws })
export const addCampaign = (ws: string, body: CampaignInput) => api<Campaign>("/campaigns", { workspaceId: ws, method: "POST", body })
export const editCampaign = (ws: string, id: string, body: CampaignInput) =>
  api<Campaign>(`/campaigns/${id}`, { workspaceId: ws, method: "PUT", body })
export const setCampaignStatus = (ws: string, id: string, status: CampaignStatus) =>
  api<Campaign>(`/campaigns/${id}/status`, { workspaceId: ws, method: "PATCH", body: { status } })
export const deleteCampaign = (ws: string, id: string) => api<void>(`/campaigns/${id}`, { workspaceId: ws, method: "DELETE" })
export const fetchEnrollments = (ws: string, id: string) => api<Enrollment[]>(`/campaigns/${id}/enrollments`, { workspaceId: ws })
export const fetchCandidates = (ws: string, id: string, q: string, approvedOnly: boolean, icpOnly = true) =>
  api<Candidate[]>(`/campaigns/${id}/candidates?q=${encodeURIComponent(q)}&approvedOnly=${approvedOnly}&icpOnly=${icpOnly}`, { workspaceId: ws })
export const addLeads = (ws: string, id: string, leadIds: string[]) =>
  api<{ added: number; skipped: Record<string, number> }>(`/campaigns/${id}/enrollments`, { workspaceId: ws, method: "POST", body: { leadIds } })
export const actOnEnrollment = (ws: string, id: string, action: "pause" | "resume" | "stop") =>
  api<Enrollment>(`/enrollments/${id}`, { workspaceId: ws, method: "PATCH", body: { action } })
export const fetchActivity = (ws: string, opts: { campaignId?: string; kind?: "" | "sends" | "replies" | "problems" } = {}) =>
  api<Activity[]>(`/own-sending/activity?kind=${opts.kind ?? ""}${opts.campaignId ? `&campaignId=${opts.campaignId}` : ""}`, { workspaceId: ws })

export interface PreviewEmail {
  stepOrder: number
  delayDays: number
  threadMode: "new" | "reply"
  subject: string
  body: string
  /** ready: exactly what goes out. to_write: a {{followUp}} Coldbrew hasn't written yet. problem: see note. */
  state: "ready" | "to_write" | "problem"
  note: string | null
}

export interface Preview {
  leadName: string
  leadEmail: string | null
  sender: string | null
  emails: PreviewEmail[]
}

/** Every email of the campaign as this lead gets it. write: Coldbrew writes missing follow-ups now (Claude). */
export const previewEnrollment = (ws: string, id: string, write = false) =>
  api<Preview>(`/enrollments/${id}/preview?write=${write}`, { workspaceId: ws, method: "POST" })
