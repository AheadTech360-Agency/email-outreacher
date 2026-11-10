"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, type CSSProperties, type ReactNode } from "react"
import { Activity, ArrowUpLeft, Check, Flame, ChevronsUpDown, CircleUserRound, Gauge, LogOut, Mailbox, Moon, PanelLeftClose, Send, Settings, Share2, Sun, UserRoundPen, type LucideIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { DispatchMark } from "@/components/config/dispatch-mark"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { useSession } from "@/lib/config-session"
import { authConfigured } from "@/lib/supabase"
import { cn } from "@/lib/utils"

// Coldbrew itself: its own address when the dashboard is on config.xxx.com, or /home when both share one address.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ""

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/campaigns", label: "Campaigns", icon: Send },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/senders", label: "Sending accounts", icon: Mailbox },
  { href: "/warming", label: "Warming accounts", icon: Flame },
  { href: "/social", label: "Social accounts", icon: Share2 },
  { href: "/personas", label: "Personas", icon: UserRoundPen },
  { href: "/settings", label: "Settings", icon: Settings },
]

/** Signed-in people get the dashboard; everyone else goes to /login. */
export function Shell({ sidebarOpen, children }: { sidebarOpen: boolean; children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { session, me, meError, signOut, retry, href } = useSession()
  const isPublic = pathname.startsWith(href("/login"))

  useEffect(() => {
    if (!isPublic && session === null) router.replace(`${href("/login")}?next=${encodeURIComponent(pathname)}`)
  }, [isPublic, session, pathname, router, href])

  if (!authConfigured)
    return (
      <Centered>
        <h1 className="text-lg font-semibold">Sign-in isn&apos;t set up</h1>
        <p className="text-sm text-muted-foreground">
          Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local (the same values as Coldbrew&apos;s), then restart.
        </p>
      </Centered>
    )
  if (isPublic) return <>{children}</>
  if (!session || (!me && !meError))
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
          <Button variant="outline" onClick={retry}>
            Try again
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </Centered>
    )

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar />
      <SidebarInset className="min-w-0">{children}</SidebarInset>
    </SidebarProvider>
  )
}

function AppSidebar() {
  const pathname = usePathname()
  const { href: at, base } = useSession()
  const active = (path: string) => (path === "/" ? pathname === at("/") : pathname.startsWith(at(path)))
  const coldbrew = APP_URL || (base ? "/home" : "")
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="gap-3 px-2 pt-3">
        <Link href={at("/")} className="flex min-w-0 items-center gap-2.5 rounded-md px-1.5 py-1 group-data-[collapsible=icon]:px-1">
          <DispatchMark />
          <span className="sidebar-reveal min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-[15px] leading-5 font-semibold tracking-[-0.01em] text-foreground">Coldbrew Sending</span>
          </span>
        </Link>
        <WorkspaceSwitcher />
      </SidebarHeader>
      <SidebarContent className="gap-0">
        <SidebarGroup className="py-0.5">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {NAV.map(({ href, label, icon: Icon }, i) => (
                <SidebarMenuItem key={href} style={{ "--i": i + 2 } as CSSProperties}>
                  <SidebarMenuButton asChild isActive={active(href)} tooltip={label} className="h-8 text-[14px] data-[active=true]:font-medium">
                    <Link href={at(href)}>
                      <Icon className="text-muted-foreground" />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-3 px-2 pb-3">
        <SidebarMenu className="gap-0.5">
          {coldbrew && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Back to Coldbrew" className="h-8 text-[14px]">
                <a href={coldbrew}>
                  <ArrowUpLeft className="text-muted-foreground" />
                  <span>Back to Coldbrew</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <CollapseToggle />
          <AccountMenu />
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function WorkspaceSwitcher() {
  const { workspaces, workspaceId, setWorkspaceId } = useSession()
  const current = workspaces.find((w) => w.id === workspaceId)
  const label = current?.name ?? "None yet"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="sidebar-reveal flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] whitespace-nowrap outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:hidden"
        style={{ "--i": 1 } as CSSProperties}
        aria-label={`Workspace: ${label}. Switch workspace`}
        disabled={workspaces.length < 2}
      >
        <span className="text-muted-foreground">Workspace</span>
        <span className={cn("ml-auto truncate font-medium", current ? "text-foreground" : "text-muted-foreground")}>{label}</span>
        {workspaces.length > 1 && <ChevronsUpDown className="size-3.5 flex-none text-muted-foreground" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Workspaces</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onSelect={() => setWorkspaceId(w.id)}>
            <span className="min-w-0 flex-1 truncate">{w.name}</span>
            {w.id === workspaceId && <Check className="text-data" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function CollapseToggle() {
  const { state, peek, toggleSidebar, isMobile } = useSidebar()
  if (isMobile) return null
  const collapsed = state === "collapsed"
  const label = !collapsed ? "Collapse sidebar" : peek ? "Keep sidebar open" : "Expand sidebar"
  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={toggleSidebar} aria-expanded={!collapsed} tooltip={`${label} (Ctrl/⌘ B)`} className="h-8 text-[14px]">
        <PanelLeftClose
          className={cn(
            "text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
            collapsed && !peek && "rotate-180",
          )}
        />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function AccountMenu() {
  const { me, session, signOut } = useSession()
  const { resolvedTheme, setTheme } = useTheme()
  const email = me?.email ?? session?.user.email ?? ""
  const dark = resolvedTheme === "dark"
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton tooltip={email || "Account"} className="h-auto py-1.5 text-[14px]" aria-label={`Account menu for ${email}`}>
            <CircleUserRound className="text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{me?.name || "Account"}</span>
              {email && <span className="block truncate text-xs text-muted-foreground">{email}</span>}
            </span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
          <DropdownMenuItem onSelect={() => setTheme(dark ? "light" : "dark")}>
            {dark ? <Sun /> : <Moon />} {dark ? "Light theme" : "Dark theme"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut()}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}

export function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-3 text-center">{children}</div>
    </main>
  )
}

/** A page's title row and body, on the framed sheet. */
export function Page({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 pb-12 md:px-8 md:pt-8">
      {/* Phones: the sidebar is a drawer, opened from here. */}
      <div className="mb-4 flex items-center gap-2 md:hidden">
        <SidebarTrigger aria-label="Open the menu" />
        <DispatchMark className="size-6" />
        <span className="text-[14px] font-semibold">Coldbrew Sending</span>
      </div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em]">{title}</h1>
          {description && <p className="max-w-[68ch] text-[13.5px] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
