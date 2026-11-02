"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, type CSSProperties } from "react"
import {
  Building2,
  Calculator,
  Check,
  ChevronsUpDown,
  CircleUserRound,
  FileText,
  FolderPlus,
  Gauge,
  Inbox,
  KeyRound,
  LogOut,
  type LucideIcon,
  Mail,
  Mails,
  MessageSquareText,
  Moon,
  Package,
  PanelLeftClose,
  Reply,
  Rocket,
  Send,
  Settings,
  Sun,
  Target,
  UserCog,
  UserPlus,
  UserSearch,
  Users,
} from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { ChangePasswordDialog } from "@/components/change-password-dialog"
import { ColdbrewMark } from "@/components/coldbrew-mark"
import { WorkspaceDialog } from "@/components/users/workspace-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { fetchEmails, fetchUsage, useApi } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { formatUsd } from "@/lib/format"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  count?: number
  /** Shown instead of a count, e.g. the month's spend. */
  badge?: string
  countLabel?: string
  tone?: string
}

export function AppSidebar() {
  const pathname = usePathname()
  const { settings, users, currentUserId, currentWorkspaceId } = useStore()
  const isAdmin = users.find((u) => u.id === currentUserId)?.role === "admin"
  // Drafts waiting for a person, from the backend.
  const drafts = useApi(
    () => (currentWorkspaceId ? fetchEmails(currentWorkspaceId) : Promise.resolve([])),
    [currentWorkspaceId, pathname],
  )
  const toReview = (drafts.data ?? []).filter((d) => d.status === "draft" || d.status === "edited").length
  // Real spend from the call ledger: Claude (estimated), Apollo and Apify dollars over the last 30 days.
  const usage = useApi(
    () => (currentWorkspaceId ? fetchUsage(currentWorkspaceId, 30) : Promise.resolve(null)),
    [currentWorkspaceId, pathname],
  )
  const spent = (usage.data?.providers ?? []).reduce((sum, p) => sum + p.costUsd, 0)
  const ratio = spent / settings.monthlyBudgetUsd

  // In the order the work happens: find who to contact, write to them, send, then run the workspace.
  const groups: { label: string; items: NavItem[] }[] = [
    {
      label: "Prospecting",
      items: [
        { href: "/quickstart", label: "Quick Start", icon: Rocket },
        { href: "/icps", label: "ICPs", icon: Target },
        { href: "/products", label: "Products", icon: Package },
        { href: "/companies", label: "Companies", icon: Building2 },
        { href: "/people", label: "People", icon: UserSearch },
        { href: "/leads", label: "Leads", icon: Users },
      ],
    },
    {
      label: "Writing",
      items: [
        { href: "/review", label: "Review", icon: Inbox, count: toReview, countLabel: `${toReview} drafts need review` },
        { href: "/prompts", label: "Prompts", icon: FileText },
        { href: "/examples", label: "Example emails", icon: Mail },
        { href: "/feedback", label: "Feedback", icon: MessageSquareText },
      ],
    },
    {
      label: "Sending",
      items: [
        { href: "/outbox", label: "Outbox", icon: Send },
        { href: "/replies", label: "Replies", icon: Reply },
        { href: "/mailboxes", label: "Mailboxes", icon: Mails },
      ],
    },
    {
      label: "Workspace",
      items: [
        {
          href: "/usage",
          label: "Usage",
          icon: Gauge,
          badge: formatUsd(spent),
          countLabel: `Spent in the last 30 days: ${formatUsd(spent)} of ${formatUsd(settings.monthlyBudgetUsd)} (${Math.round(ratio * 100)}%)`,
          tone: ratio >= 1 ? "text-negative" : ratio >= 0.8 ? "text-warning" : undefined,
        },
        { href: "/costs", label: "Cost estimator", icon: Calculator },
        ...(isAdmin ? [{ href: "/users", label: "Users", icon: UserCog }] : []),
        { href: "/settings", label: "Settings", icon: Settings },
      ],
    },
  ]
  // Each row's place in the reveal animation, counted across the groups.
  const order = new Map(groups.flatMap((g) => g.items).map((item, i) => [item.href, i + 2]))

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="gap-3 px-2 pt-3">
        <Link
          href="/icps"
          className="flex min-w-0 items-center gap-2.5 rounded-md px-1.5 py-1 group-data-[collapsible=icon]:px-1"
        >
          <ColdbrewMark />
          <span className="sidebar-reveal truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground group-data-[collapsible=icon]:hidden">
            Coldbrew
          </span>
        </Link>
        <WorkspaceSwitcher isAdmin={isAdmin} />
      </SidebarHeader>
      <SidebarContent className="gap-0">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="py-0.5">
            <SidebarGroupLabel className="sidebar-reveal h-6 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map(({ href, label, icon: Icon, count, badge, countLabel, tone }) => (
                  <SidebarMenuItem key={href} style={{ "--i": order.get(href) } as CSSProperties}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith(href)}
                      tooltip={label}
                      className="h-8 text-[14px] data-[active=true]:font-medium"
                    >
                      <Link href={href}>
                        <Icon className="text-muted-foreground" />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {(!!count || badge) && (
                      <SidebarMenuBadge className={cn("tabular-nums", tone ?? "text-muted-foreground")} title={countLabel} aria-label={countLabel}>
                        {badge ?? count}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-3 px-2 pb-3">
        <SidebarMenu className="gap-0.5">
          <CollapseToggle />
          <AccountMenu />
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

/** The current workspace; opens a menu to switch to another or, for admins, create one. */
function WorkspaceSwitcher({ isAdmin }: { isAdmin: boolean }) {
  const { users, workspaces, workspacesStatus, currentUserId, currentWorkspaceId, setCurrentWorkspace } = useStore()
  const [creating, setCreating] = useState(false)
  const me = users.find((u) => u.id === currentUserId)
  const mine = workspaces.filter((w) => isAdmin || me?.workspaceIds.includes(w.id))
  const current = workspaces.find((w) => w.id === currentWorkspaceId)
  const label =
    current?.name ?? (workspacesStatus === "loading" ? "Loading…" : workspacesStatus === "error" ? "Backend offline" : "None yet")

  const switchTo = (id: string, name: string) => {
    setCurrentWorkspace(id)
    toast.success(`Switched to ${name}`)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="sidebar-reveal flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] whitespace-nowrap outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:hidden"
          style={{ "--i": 1 } as CSSProperties}
          aria-label={`Workspace: ${label}. Switch workspace`}
        >
          <span className="text-muted-foreground">Workspace</span>
          <span className={cn("ml-auto truncate font-medium", current ? "text-foreground" : "text-muted-foreground")}>
            {label}
          </span>
          <ChevronsUpDown className="size-3.5 flex-none text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Workspaces</DropdownMenuLabel>
          {mine.map((w) => (
            <DropdownMenuItem key={w.id} onSelect={() => w.id !== currentWorkspaceId && switchTo(w.id, w.name)}>
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {w.id === currentWorkspaceId && <Check className="text-data" />}
            </DropdownMenuItem>
          ))}
          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCreating(true)}>
                <FolderPlus /> Create workspace
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/users?tab=workspaces">
                  <UserCog /> Manage workspaces
                </Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {creating && <WorkspaceDialog onClose={() => setCreating(false)} onCreated={(ws) => setCurrentWorkspace(ws.id)} />}
    </>
  )
}

/** Collapses the sidebar to an icon rail, or pins it open again. Ctrl/⌘ B does the same.
 *  It is the last row of the footer so it stays under the pointer in every state. */
function CollapseToggle() {
  const { state, peek, toggleSidebar, isMobile } = useSidebar()
  if (isMobile) return null
  const collapsed = state === "collapsed"
  const label = !collapsed ? "Collapse sidebar" : peek ? "Keep sidebar open" : "Expand sidebar"
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={toggleSidebar}
        aria-expanded={!collapsed}
        tooltip={`${label} (Ctrl/⌘ B)`}
        className="h-8 text-[14px]"
      >
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

/** Who's signed in, as one row. Its menu switches to another account signed in on this browser (no
 * password needed), adds one, switches the theme, changes the password or signs out of this account. */
function AccountMenu() {
  const { me, session, signOut, accounts, switchAccount } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [changing, setChanging] = useState(false)
  const email = me?.email ?? session?.user.email ?? ""
  const dark = resolvedTheme === "dark"
  return (
    <>
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
          <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-60">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Accounts on this browser</DropdownMenuLabel>
            {accounts.map((a) => {
              const here = a.userId === session?.user.id
              return (
                <DropdownMenuItem
                  key={a.userId}
                  disabled={here}
                  className="data-disabled:opacity-100"
                  onSelect={() =>
                    void switchAccount(a.userId).catch((e: unknown) =>
                      toast.error("Couldn't switch", { description: e instanceof Error ? e.message : undefined }),
                    )
                  }
                >
                  <CircleUserRound />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{a.name || a.email}</span>
                    {a.name && <span className="block truncate text-xs text-muted-foreground">{a.email}</span>}
                  </span>
                  {here && <Check className="text-data" aria-label="Current account" />}
                </DropdownMenuItem>
              )
            })}
            <DropdownMenuItem onSelect={() => router.push(`/login?add=1&next=${encodeURIComponent(pathname)}`)}>
              <UserPlus /> Add another account
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setTheme(dark ? "light" : "dark")}>
              {dark ? <Sun /> : <Moon />} {dark ? "Light theme" : "Dark theme"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setChanging(true)}>
              <KeyRound /> Change password
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void signOut()}>
              <LogOut /> {accounts.length > 1 ? "Sign out of this account" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      {changing && <ChangePasswordDialog email={email} onClose={() => setChanging(false)} />}
    </>
  )
}
