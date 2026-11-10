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
