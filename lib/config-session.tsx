"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { useAuth } from "./auth"
import { type Workspace, errorText, fetchWorkspaces } from "./config-api"

// The sending dashboard's own state, on top of Coldbrew's sign-in (lib/auth): which workspace it's showing, and
// where its pages are. On its own address (config.xxx.com) they're at the root ("/senders"); on Coldbrew's address
// they're under /config ("/config/senders"). proxy.ts decides, and the layout passes it in as `base`.

interface ConfigState {
  base: string
  /** A dashboard page's address: href("/senders") is "/senders" on config.xxx.com, "/config/senders" elsewhere. */
  href: (path: string) => string
  workspaces: Workspace[]
  workspacesError: string | null
  workspaceId: string | null
  setWorkspaceId: (id: string) => void
}

const Ctx = createContext<ConfigState | null>(null)
const WORKSPACE_KEY = "coldbrew-config:workspace"

function savedWorkspace(): string | null {
  try {
    return window.localStorage.getItem(WORKSPACE_KEY)
  } catch {
    return null
  }
}

export function ConfigProvider({ base, children }: { base: string; children: ReactNode }) {
  const { session } = useAuth()
  const [loaded, setLoaded] = useState<{ for: string; workspaces: Workspace[]; error: string | null } | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let live = true
    fetchWorkspaces()
      .then((workspaces) => live && setLoaded({ for: userId, workspaces, error: null }))
      .catch((e: unknown) => live && setLoaded({ for: userId, workspaces: [], error: errorText(e) }))
    return () => {
      live = false
    }
  }, [userId])

  const current = loaded && loaded.for === userId ? loaded : null
  const workspaces = current?.workspaces ?? []
  const preferred = chosen ?? (typeof window === "undefined" ? null : savedWorkspace())
  const workspaceId = workspaces.find((w) => w.id === preferred)?.id ?? workspaces[0]?.id ?? null

  const setWorkspaceId = useCallback((id: string) => {
    setChosen(id)
    try {
      window.localStorage.setItem(WORKSPACE_KEY, id)
    } catch {
      // Private browsing: the choice lasts this visit.
    }
  }, [])

  const href = useCallback((path: string) => (base ? (path === "/" ? base : `${base}${path}`) : path), [base])

  return (
    <Ctx.Provider value={{ base, href, workspaces, workspacesError: current?.error ?? null, workspaceId, setWorkspaceId }}>
      {children}
    </Ctx.Provider>
  )
}

/** The dashboard's state plus who's signed in (Coldbrew's useAuth). */
export function useSession() {
  const ctx = useContext(Ctx)
  const auth = useAuth()
  if (!ctx) throw new Error("useSession must be used inside ConfigProvider")
  return { ...ctx, session: auth.session, me: auth.me, meError: auth.meError, signIn: auth.signIn, signOut: auth.signOut, retry: auth.reloadMe }
}
