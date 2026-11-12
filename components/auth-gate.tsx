"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect, type ReactNode } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { Button } from "@/components/ui/button"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useAuth } from "@/lib/auth"
import { isProspector } from "@/lib/roles"
import { authConfigured } from "@/lib/supabase"
import { StoreProvider } from "@/lib/store"

// The one page anyone can open.
const PUBLIC = ["/login"]
// A Prospector's pages: Quick Start, Companies, People, Smart lists, Products, and an ICP's definition (not its leads,
// prompts or review).
const PROSPECTOR_PAGES = [
  /^\/quickstart(\/|$)/, /^\/companies(\/|$)/, /^\/people(\/|$)/, /^\/smart-lists(\/|$)/, /^\/products(\/|$)/,
  /^\/icps(\/[^/]+)?\/?$/,
]

/** Shows the app to a signed-in person and sends everyone else to /login. */
export function AuthGate({ sidebarOpen, site = "app", children }: { sidebarOpen: boolean; site?: "app" | "config"; children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { session, me, meError, signOut, reloadMe } = useAuth()
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p))
  // The sending dashboard runs its own gate and sidebar (app/config/layout.tsx).
  const dashboard = site === "config"

  useEffect(() => {
    if (!dashboard && !isPublic && session === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`)
  }, [dashboard, isPublic, session, pathname, router])
  // A Prospector has only their pages: any other takes them to Quick Start (the backend refuses the rest anyway).
  const elsewhere = !dashboard && !isPublic && isProspector(me?.role) && !PROSPECTOR_PAGES.some((page) => page.test(pathname))
  useEffect(() => {
    if (elsewhere) router.replace("/quickstart")
  }, [elsewhere, router])

  if (dashboard) return <>{children}</>

  if (!authConfigured)
    return (
      <Centered>
        <h1 className="text-lg font-semibold">Sign-in isn&apos;t set up</h1>
        <p className="text-sm text-muted-foreground">
          Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to the frontend&apos;s .env.local, then restart it.
        </p>
      </Centered>
    )

  if (isPublic) return <>{children}</>

  if (session === undefined || session === null || (!me && !meError))
    return (
      <Centered>
        <p className="wait-appear text-sm text-muted-foreground">{session === null ? "Taking you to sign in…" : "Signing you in…"}</p>
      </Centered>
    )

  if (!me)
    return (
      <Centered>
        <h1 className="text-lg font-semibold">Couldn&apos;t open your account</h1>
        <p className="text-sm text-muted-foreground">{meError}</p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={reloadMe}>
            Try again
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </Centered>
    )

  if (elsewhere)
    return (
      <Centered>
        <p className="wait-appear text-sm text-muted-foreground">Taking you to Quick Start…</p>
      </Centered>
    )

  return (
    <StoreProvider>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <AppSidebar />
        <SidebarInset className="min-w-0">{children}</SidebarInset>
      </SidebarProvider>
    </StoreProvider>
  )
}

export function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-3 text-center">{children}</div>
    </main>
  )
}
