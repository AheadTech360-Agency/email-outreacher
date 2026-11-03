"use client"

import type { Session } from "@supabase/supabase-js"
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { type SavedAccount, forgetAccount, rememberMe, rememberSession, savedAccounts } from "./accounts"
import { fetchMe } from "./api"
import { supabase } from "./supabase"
import type { User } from "./types"

interface Auth {
  /** undefined while the saved session is being read. */
  session: Session | null | undefined
  /** This app's record of the signed-in person: role and workspaces. null until loaded. */
  me: User | null
  meError: string | null
  signIn: (email: string, password: string) => Promise<void>
  /** Signs out of this account only; the next account saved on this browser takes over, if there is one. */
  signOut: () => Promise<void>
  /** Every account signed in on this browser, most recently used first (the current one included). */
  accounts: SavedAccount[]
  /** Switch to another saved account without its password. The page reloads, so nothing of the old account shows. */
  switchAccount: (userId: string) => Promise<void>
  reloadMe: () => void
}

const AuthContext = createContext<Auth | null>(null)

/** A full page load on purpose: nothing (data, workspace, caches) from the previous account may carry over. */
function reloadAt(path: string) {
  window.location.assign(path)
}

// Set while this tab is the one changing accounts, so only the other tabs reload.
let changingHere = false

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  // Kept with the account they belong to, so a different (or no) account never shows a stale one.
  const [loaded, setLoaded] = useState<{ for: string; me: User | null; error: string | null } | null>(null)
  const [tick, setTick] = useState(0)
  const [accounts, setAccounts] = useState<SavedAccount[]>([])

  useEffect(() => {
    // Every new or refreshed session is saved, so a later switch back to this account has current tokens.
    let shown: string | undefined
    const seen = (next: Session | null) => {
      if (next) rememberSession(next)
      // Another tab switched accounts: reload, so this one doesn't show the old account's data.
      if (shown && next && next.user.id !== shown && !changingHere) window.location.reload()
      shown = next?.user.id ?? shown
      setAccounts(savedAccounts())
      setSession(next)
    }
    void supabase.auth.getSession().then(({ data }) => seen(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => seen(next))
    return () => data.subscription.unsubscribe()
  }, [])

  // Who they are here follows the account, not each token refresh.
  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let live = true
    fetchMe()
      .then((u) => {
        if (!live) return
        setLoaded({ for: userId, me: u, error: null })
        rememberMe(userId, u)
        setAccounts(savedAccounts())
      })
      .catch(
        (e: unknown) =>
          live && setLoaded({ for: userId, me: null, error: e instanceof Error ? e.message : "Couldn't load your account." }),
      )
    return () => {
      live = false
    }
  }, [userId, tick])
  const current = loaded && loaded.for === userId ? loaded : null
  // Until the backend answers, who they were last time: a full page load then shows the app at once instead of
  // "Signing you in…". The backend still checks every request, and its answer replaces this.
  const savedMe = useMemo(() => (userId ? (savedAccounts().find((a) => a.userId === userId)?.me ?? null) : null), [userId])
  const me = current ? current.me : savedMe
  const meError = current?.error ?? null

  const signIn = useCallback(async (email: string, password: string) => {
    changingHere = true
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new Error(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message)
  }, [])

  const switchAccount = useCallback(async (to: string) => {
    const saved = savedAccounts().find((a) => a.userId === to)
    if (!saved) throw new Error("That account isn't signed in on this browser any more.")
    changingHere = true
    const { error } = await supabase.auth.setSession({ access_token: saved.accessToken, refresh_token: saved.refreshToken })
    if (error) {
      forgetAccount(to)
      setAccounts(savedAccounts())
      throw new Error(`${saved.email}'s sign-in has expired. Add it again with its password.`)
    }
    // A full reload, so no data, workspace or cache from the previous account carries over.
    reloadAt("/home")
  }, [])

  const signOut = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const leaving = data.session?.user.id
    changingHere = true
    await supabase.auth.signOut()
    if (leaving) forgetAccount(leaving)
    setAccounts(savedAccounts())
    const nextUp = savedAccounts()[0]
    if (nextUp) await switchAccount(nextUp.userId).catch(() => reloadAt("/login"))
  }, [switchAccount])

  const reloadMe = useCallback(() => setTick((t) => t + 1), [])

  return (
    <AuthContext.Provider value={{ session, me, meError, signIn, signOut, accounts, switchAccount, reloadMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
