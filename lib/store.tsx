"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
import * as api from "./api"
import { useAuth } from "./auth"
import { DEFAULT_SETTINGS } from "./defaults"
import type { ICP, IcpOutreach, Lead, PromptKind, PromptTemplate, PromptVersion, Settings, User, Workspace } from "./types"

// App state shared across pages, for the signed-in person. Workspaces, ICPs, leads, prompts, users and the
// workspace's settings come from the backend.

export type VersionDraft = Pick<PromptVersion, "systemPrompt" | "userPrompt" | "model" | "temperature" | "maxTokens" | "maxPosts">

interface Store {
  icps: ICP[]
  /** Goes up whenever leads change (added, moved, deleted, or written to elsewhere): pages that show leads read
   * them again then. Leads themselves are read a page at a time by those pages (lib/lists.ts), never all at once. */
  leadsVersion: number
  reloadLeads: () => void
  templates: PromptTemplate[]
  versions: PromptVersion[]
  /** The workspace's defaults, review and auto-send settings, from the backend (shared by everyone in it). */
  settings: Settings
  /** Save them for the whole workspace. Rejects with the reason when this role can't change them. */
  saveSettings: (next: Settings) => Promise<void>

  /** Lead Intel's ICPs with this workspace's outreach settings. Empty until loaded; see icpsStatus. */
  icpsStatus: "loading" | "ready" | "error"
  icpsError: string | null
  reloadIcps: () => void
  /**
   * Change an ICP's outreach settings, prompt choices included. Saved to the backend (Lead Intel's own
   * fields are never sent). Rejects if the save fails.
   */
  updateIcp: (id: string, patch: Partial<IcpOutreach>) => Promise<void>
  /**
   * Add an ICP to Lead Intel (shared by both projects), then save this workspace's outreach settings
   * for it if any were given. Rejects with the backend's reason (e.g. a name that's taken) if the ICP
   * wasn't created. If it was but the outreach settings didn't save, resolves with a `warning`.
   */
  /** campaignNote: what happened to the ICP's CheapSequencer campaign. */
  createIcp: (input: api.IcpCreate, outreach?: Partial<IcpOutreach>) => Promise<{ icp: ICP; warning?: string; campaignNote?: string }>
  /** Change an ICP's Lead Intel fields (name, industry, rule…) in Lead Intel. Rejects with the backend's reason. */
  updateIcpDefinition: (id: string, input: api.IcpCreate) => Promise<{ icp: ICP; campaignNote?: string }>
  /** Archive (off) or restore (on) an ICP; campaignNote says what happened to its campaign. */
  setIcpArchived: (id: string, archived: boolean) => Promise<{ icp: ICP; campaignNote?: string }>
  deleteIcp: (id: string) => Promise<void>
  /** Add one lead in the backend. Rejects with the backend's reason (e.g. they're already a lead). */
  addLead: (input: api.LeadInput) => Promise<Lead>
  /** Move leads to another ICP in the backend. */
  moveLeads: (ids: string[], icpId: string) => Promise<void>
  /** Delete leads in the backend, with their posts and drafts. */
  deleteLeads: (ids: string[]) => Promise<void>
  /** The workspace's prompts, from the backend. Empty until loaded; see promptsStatus. */
  promptsStatus: "loading" | "ready" | "error"
  promptsError: string | null
  reloadPrompts: () => void
  /** Saved in the backend as the template's next version. Rejects with the backend's reason. */
  saveVersion: (templateId: string, draft: VersionDraft, note: string) => Promise<PromptVersion>
  restoreVersion: (versionId: string) => Promise<PromptVersion | undefined>
  duplicateTemplate: (templateId: string) => Promise<PromptTemplate>
  /** New template whose v1 is the given prompt. */
  createTemplate: (input: { name: string; kind: PromptKind; draft: VersionDraft; note: string; isDefault?: boolean }) => Promise<PromptTemplate>
  /** Removes a template and its versions. The backend refuses the default or one an ICP uses. */
  deleteTemplate: (templateId: string) => Promise<void>
  setDefaultTemplate: (templateId: string) => Promise<void>

  users: User[]
  /** From the backend. Empty until loaded; see workspacesStatus. */
  workspaces: Workspace[]
  workspacesStatus: "loading" | "ready" | "error"
  workspacesError: string | null
  reloadWorkspaces: () => void
  currentUserId: string
  currentWorkspaceId: string
  setCurrentWorkspace: (id: string) => void
  /** Adds them and makes their sign-in. Waits for the answer: it can be refused (a weak password, say). */
  inviteUser: (input: Pick<User, "name" | "email" | "role" | "workspaceIds"> & { password: string }) => Promise<"created" | "existing">
  updateUser: (id: string, patch: Partial<Pick<User, "name" | "role" | "workspaceIds" | "status">>) => void
  removeUser: (id: string) => void
  /** Saved in the backend. Rejects with the backend's reason (e.g. the name is taken). */
  createWorkspace: (input: { name: string; description: string; memberIds: string[] }) => Promise<Workspace>
  updateWorkspace: (id: string, patch: Partial<Pick<Workspace, "name" | "description">>) => Promise<void>
  /** Sets which non-admins can open the workspace. Admins always can, so they're left alone. */
  setWorkspaceMembers: (id: string, memberIds: string[]) => void
  /** Deletes it in the backend and takes it off every user. Callers check it is not the current one. */
  deleteWorkspace: (id: string) => Promise<void>
}

const StoreContext = createContext<Store | null>(null)

const CURRENT_WORKSPACE_KEY = "eo.currentWorkspaceId"

export function StoreProvider({ children }: { children: ReactNode }) {
  const [icps, setIcps] = useState<ICP[]>([])
  const [icpsStatus, setIcpsStatus] = useState<Store["icpsStatus"]>("loading")
  const [icpsError, setIcpsError] = useState<string | null>(null)
  const [icpsTick, setIcpsTick] = useState(0)
  const [leadsTick, setLeadsTick] = useState(0)
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [promptsStatus, setPromptsStatus] = useState<Store["promptsStatus"]>("loading")
  const [promptsError, setPromptsError] = useState<string | null>(null)
  const [promptsTick, setPromptsTick] = useState(0)
  // Kept with the workspace they belong to, so another workspace never shows these.
  const [loadedSettings, setLoadedSettings] = useState<{ workspaceId: string; settings: Settings } | null>(null)
  const { me } = useAuth()
  // Admins see everyone (loaded below); anyone else only themselves.
  const [allUsers, setUsers] = useState<User[]>([])
  const users = me?.role === "admin" ? allUsers : me ? [me] : []
  const [usersTick, setUsersTick] = useState(0)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspacesStatus, setWorkspacesStatus] = useState<Store["workspacesStatus"]>("loading")
  const [workspacesError, setWorkspacesError] = useState<string | null>(null)
  const [workspacesTick, setWorkspacesTick] = useState(0)
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState("")

  // The chosen workspace is remembered per browser; it falls back to the first one.
  const setCurrentWorkspace = useCallback((id: string) => {
    setCurrentWorkspaceId(id)
    try {
      localStorage.setItem(CURRENT_WORKSPACE_KEY, id)
    } catch {
      // Storage can be unavailable (private windows); the choice just won't survive a reload.
    }
  }, [])

  useEffect(() => {
    let live = true
    api
      .fetchWorkspaces()
      .then((list) => {
        if (!live) return
        setWorkspaces(list)
        setWorkspacesStatus("ready")
        setWorkspacesError(null)
        let saved: string | null = null
        try {
          saved = localStorage.getItem(CURRENT_WORKSPACE_KEY)
        } catch {}
        setCurrentWorkspaceId((current) =>
          list.some((w) => w.id === current) ? current : list.find((w) => w.id === saved)?.id ?? list[0]?.id ?? "",
        )
      })
      .catch((e: unknown) => {
        if (!live) return
        setWorkspacesStatus("error")
        setWorkspacesError(e instanceof Error ? e.message : "Couldn't load workspaces.")
      })
    return () => {
      live = false
    }
  }, [workspacesTick])

  // A Prospector only has Quick Start: settings and prompts aren't theirs to read (the backend refuses them).
  const prospector = me?.role === "prospector"
  // Settings belong to the workspace: everyone in it sees the same, saved in the backend.
  useEffect(() => {
    if (!currentWorkspaceId || prospector) return
    let live = true
    api
      .fetchGeneralSettings(currentWorkspaceId)
      .then((saved) => live && setLoadedSettings({ workspaceId: currentWorkspaceId, settings: saved }))
      .catch((e: unknown) => live && toast.error("Couldn't load settings", { description: e instanceof Error ? e.message : undefined }))
    return () => {
      live = false
    }
  }, [currentWorkspaceId, prospector])
  const settings = loadedSettings?.workspaceId === currentWorkspaceId ? loadedSettings.settings : DEFAULT_SETTINGS

  const saveSettings: Store["saveSettings"] = async (next) => {
    const saved = await api.saveGeneralSettings(currentWorkspaceId, next)
    setLoadedSettings({ workspaceId: currentWorkspaceId, settings: saved })
  }

  const meId = me?.id
  const meRole = me?.role
  useEffect(() => {
    if (!meId || meRole !== "admin") return
    let live = true
    api
      .fetchUsers()
      .then((list) => live && setUsers(list))
      .catch((e: unknown) => live && toast.error("Couldn't load users", { description: e instanceof Error ? e.message : undefined }))
    return () => {
      live = false
    }
  }, [meId, meRole, usersTick])
  const reloadUsers = () => setUsersTick((t) => t + 1)

  /** A change already shown on screen: saved in the background; if the backend refuses, say why and reload. */
  const save = (label: string, call: Promise<unknown>, then?: () => void) =>
    call.then(then).catch((e: unknown) => {
      toast.error(label, { description: e instanceof Error ? e.message : undefined })
      reloadUsers()
    })

  const reloadWorkspaces = useCallback(() => {
    setWorkspacesStatus("loading")
    setWorkspacesTick((t) => t + 1)
  }, [])

  // Pages that show leads read them a page at a time and again whenever this goes up.
  const reloadLeads = useCallback(() => setLeadsTick((t) => t + 1), [])

  // ICPs come from Lead Intel (shared with it) plus this workspace's outreach settings, so they
  // reload whenever the workspace changes.
  useEffect(() => {
    if (!currentWorkspaceId) return
    let live = true
    api
      .fetchIcps(currentWorkspaceId)
      .then((list) => {
        if (!live) return
        setIcps(list.map(api.toIcp))
        setIcpsStatus("ready")
        setIcpsError(null)
      })
      .catch((e: unknown) => {
        if (!live) return
        setIcpsStatus("error")
        setIcpsError(e instanceof Error ? e.message : "Couldn't load ICPs.")
      })
    return () => {
      live = false
    }
  }, [currentWorkspaceId, icpsTick])

  // Prompts belong to the workspace. The backend creates its built-in defaults on the first read.
  useEffect(() => {
    if (!currentWorkspaceId || prospector) return
    let live = true
    api
      .fetchPrompts(currentWorkspaceId)
      .then(({ prompts, versions }) => {
        if (!live) return
        setTemplates(prompts)
        setVersions(versions)
        setPromptsStatus("ready")
        setPromptsError(null)
      })
      .catch((e: unknown) => {
        if (!live) return
        setPromptsStatus("error")
        setPromptsError(e instanceof Error ? e.message : "Couldn't load prompts.")
      })
    return () => {
      live = false
    }
  }, [currentWorkspaceId, promptsTick, prospector])

  const reloadPrompts = useCallback(() => {
    setPromptsStatus("loading")
    setPromptsTick((t) => t + 1)
  }, [])

  const reloadIcps = useCallback(() => {
    setIcpsStatus("loading")
    setIcpsTick((t) => t + 1)
  }, [])

  const createIcp: Store["createIcp"] = async (input, outreach) => {
    const raw = await api.createIcp(input)
    let icp = api.toIcp(raw)
    let warning: string | undefined
    if (outreach && Object.keys(outreach).length) {
      try {
        const saved = await api.saveIcpOutreach(currentWorkspaceId, icp.id, { ...icp, ...outreach })
        icp = { ...icp, ...outreach, updatedAt: saved.updatedAt }
      } catch (e) {
        warning = `The ICP was created, but who to reach wasn't saved: ${e instanceof Error ? e.message : "unknown error"}`
      }
    }
    setIcps((list) => [...list, icp].sort((a, b) => a.priority - b.priority))
    return { icp, warning, campaignNote: raw.campaignNote ?? undefined }
  }

  const updateIcpDefinition: Store["updateIcpDefinition"] = async (id, input) => {
    const raw = await api.updateIcpDefinition(currentWorkspaceId, id, input)
    const icp = api.toIcp(raw)
    setIcps((list) => list.map((i) => (i.id === id ? icp : i)).sort((a, b) => a.priority - b.priority))
    return { icp, campaignNote: raw.campaignNote ?? undefined }
  }

  const setIcpArchived: Store["setIcpArchived"] = async (id, archived) => {
    const raw = await (archived ? api.archiveIcp : api.restoreIcp)(currentWorkspaceId, id)
    const icp = api.toIcp(raw)
    setIcps((list) => list.map((i) => (i.id === id ? icp : i)))
    return { icp, campaignNote: raw.campaignNote ?? undefined }
  }

  const deleteIcp: Store["deleteIcp"] = async (id) => {
    await api.deleteIcp(currentWorkspaceId, id)
    setIcps((list) => list.filter((i) => i.id !== id))
  }

  const updateIcp: Store["updateIcp"] = async (id, patch) => {
    const current = icps.find((i) => i.id === id)
    if (!current) return
    const next: ICP = { ...current, ...patch }
    const saved = await api.saveIcpOutreach(currentWorkspaceId, id, next)
    next.updatedAt = saved.updatedAt
    setIcps((list) => list.map((icp) => (icp.id === id ? next : icp)))
  }

  const addLead: Store["addLead"] = async (input) => {
    const lead = await api.addLeadApi(currentWorkspaceId, input)
    reloadLeads()
    return lead
  }

  const moveLeads: Store["moveLeads"] = async (ids, icpId) => {
    await api.moveLeadsApi(currentWorkspaceId, ids, icpId)
    reloadLeads()
  }

  const deleteLeads: Store["deleteLeads"] = async (ids) => {
    await api.deleteLeadsApi(currentWorkspaceId, ids)
    reloadLeads()
  }

  const saveVersion: Store["saveVersion"] = async (templateId, draft, note) => {
    const version = await api.savePromptVersion(currentWorkspaceId, templateId, draft, note)
    setVersions((list) => [...list, version])
    setTemplates((list) => list.map((t) => (t.id === templateId ? { ...t, currentVersionId: version.id } : t)))
    return version
  }

  const restoreVersion: Store["restoreVersion"] = async (versionId) => {
    const source = versions.find((v) => v.id === versionId)
    if (!source) return undefined
    const { systemPrompt, userPrompt, model, temperature, maxTokens, maxPosts } = source
    return saveVersion(
      source.templateId,
      { systemPrompt, userPrompt, model, temperature, maxTokens, maxPosts },
      `Restored from v${source.version}`,
    )
  }

  const createTemplate: Store["createTemplate"] = async ({ name, kind, draft, note, isDefault }) => {
    const { prompt, version } = await api.createPrompt(currentWorkspaceId, { name: name.trim(), kind, version: draft, note, isDefault })
    setTemplates((list) => [...list.map((t) => (isDefault && t.kind === kind ? { ...t, isDefault: false } : t)), prompt])
    setVersions((list) => [...list, version])
    return prompt
  }

  const duplicateTemplate: Store["duplicateTemplate"] = async (templateId) => {
    const tpl = templates.find((t) => t.id === templateId)!
    const current = versions.find((v) => v.id === tpl.currentVersionId)!
    const { systemPrompt, userPrompt, model, temperature, maxTokens, maxPosts } = current
    return createTemplate({
      name: `${tpl.name} (copy)`,
      kind: tpl.kind,
      draft: { systemPrompt, userPrompt, model, temperature, maxTokens, maxPosts },
      note: `Duplicated from ${tpl.name} v${current.version}`,
    })
  }

  const deleteTemplate: Store["deleteTemplate"] = async (templateId) => {
    await api.deletePrompt(currentWorkspaceId, templateId)
    setTemplates((list) => list.filter((t) => t.id !== templateId))
    setVersions((list) => list.filter((v) => v.templateId !== templateId))
  }

  const setDefaultTemplate: Store["setDefaultTemplate"] = async (templateId) => {
    const tpl = templates.find((t) => t.id === templateId)
    if (!tpl) return
    await api.updatePrompt(currentWorkspaceId, templateId, { isDefault: true })
    setTemplates((list) => list.map((t) => (t.kind === tpl.kind ? { ...t, isDefault: t.id === templateId } : t)))
  }

  const inviteUser: Store["inviteUser"] = async (input) => {
    const { signIn, ...user } = await api.addUserApi({ ...input, name: input.name.trim(), email: input.email.trim().toLowerCase() })
    setUsers((list) => [...list, user])
    return signIn
  }

  const updateUser: Store["updateUser"] = (id, patch) => {
    setUsers((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)))
    const { status, ...rest } = patch
    void save("Couldn't save the change", api.updateUserApi(id, status === "invited" ? rest : { ...rest, ...(status && { status }) }))
  }

  const removeUser: Store["removeUser"] = (id) => {
    setUsers((list) => list.filter((u) => u.id !== id))
    void save("Couldn't remove them", api.removeUserApi(id))
  }

  const createWorkspace: Store["createWorkspace"] = async ({ name, description, memberIds }) => {
    const ws = await api.createWorkspace({ name: name.trim(), description: description.trim() })
    setWorkspaces((list) => [...list, ws])
    const members = memberIds.filter((id) => users.find((u) => u.id === id)?.role !== "admin")
    if (members.length) void save("Couldn't add the members", api.setWorkspaceMembersApi(ws.id, members))
    // Admins see every workspace; everyone else only the ones they were added to.
    setUsers((list) =>
      list.map((u) => (u.role === "admin" || memberIds.includes(u.id) ? { ...u, workspaceIds: [...u.workspaceIds, ws.id] } : u)),
    )
    return ws
  }

  const updateWorkspace: Store["updateWorkspace"] = async (id, patch) => {
    const ws = await api.updateWorkspace(id, patch)
    setWorkspaces((list) => list.map((w) => (w.id === id ? ws : w)))
  }

  const setWorkspaceMembers: Store["setWorkspaceMembers"] = (id, memberIds) => {
    setUsers((list) =>
      list.map((u) => {
        if (u.role === "admin") return u
        const without = u.workspaceIds.filter((w) => w !== id)
        return { ...u, workspaceIds: memberIds.includes(u.id) ? [...without, id] : without }
      }),
    )
    const members = memberIds.filter((m) => users.find((u) => u.id === m)?.role !== "admin")
    void save("Couldn't save the members", api.setWorkspaceMembersApi(id, members))
  }

  const deleteWorkspace: Store["deleteWorkspace"] = async (id) => {
    await api.deleteWorkspace(id)
    setWorkspaces((list) => list.filter((w) => w.id !== id))
    setUsers((list) => list.map((u) => ({ ...u, workspaceIds: u.workspaceIds.filter((w) => w !== id) })))
  }

  return (
    <StoreContext.Provider
      value={{
        icps,
        leadsVersion: leadsTick,
        reloadLeads,
        templates,
        versions,
        settings,
        saveSettings,
        icpsStatus,
        icpsError,
        reloadIcps,
        updateIcp,
        updateIcpDefinition,
        setIcpArchived,
        deleteIcp,
        createIcp,
        addLead,
        moveLeads,
        deleteLeads,
        promptsStatus,
        promptsError,
        reloadPrompts,
        saveVersion,
        restoreVersion,
        duplicateTemplate,
        createTemplate,
        deleteTemplate,
        setDefaultTemplate,
        users,
        workspaces,
        workspacesStatus,
        workspacesError,
        reloadWorkspaces,
        currentUserId: me?.id ?? "",
        currentWorkspaceId,
        setCurrentWorkspace,
        inviteUser,
        updateUser,
        removeUser,
        createWorkspace,
        updateWorkspace,
        setWorkspaceMembers,
        deleteWorkspace,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error("useStore must be used inside StoreProvider")
  return store
}
