"use client"

import { useEffect, useState } from "react"
import { Briefcase, Camera, Gauge, MoreHorizontal, Plug, RefreshCw, RotateCcw, Unplug, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { LoadError } from "@/components/config/load-error"
import { Page } from "@/components/config/shell"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  type Sender,
  type SocialAccount,
  type SocialProvider,
  type SocialStatus,
  canManage,
  connectSocial,
  disconnectSocial,
  errorText,
  fetchSenders,
  fetchSocial,
  linkSocial,
  reconnectSocial,
  setSocialLimits,
  syncSocial,
  useApi,
} from "@/lib/config-api"
import { useSession } from "@/lib/config-session"
import { cn } from "@/lib/utils"

const NETWORK: Record<SocialProvider, { name: string; icon: LucideIcon }> = {
  linkedin: { name: "LinkedIn", icon: Briefcase },
  instagram: { name: "Instagram", icon: Camera },
}

const STATUS: Record<SocialStatus, { label: string; className: string }> = {
  ok: { label: "Connected", className: "bg-pill-positive text-pill-positive-ink" },
  connecting: { label: "Connecting", className: "bg-pill-info text-pill-info-ink" },
  credentials: { label: "Sign in again", className: "bg-pill-negative text-pill-negative-ink" },
  permissions: { label: "Needs permission", className: "bg-pill-warning text-pill-warning-ink" },
  error: { label: "Error", className: "bg-pill-negative text-pill-negative-ink" },
  stopped: { label: "Stopped", className: "bg-pill-neutral text-pill-neutral-ink" },
}

const NONE = "none"

export default function SocialAccountsPage() {
  const { workspaceId, me } = useSession()
  const manager = canManage(me?.role)
  const social = useApi(() => (workspaceId ? fetchSocial(workspaceId) : Promise.resolve(null)), [workspaceId])
  const senders = useApi(() => (workspaceId ? fetchSenders(workspaceId) : Promise.resolve([])), [workspaceId])
  const [busy, setBusy] = useState<string | null>(null)
  const [awaiting, setAwaiting] = useState(false)
  const [removing, setRemoving] = useState<SocialAccount | null>(null)
  const [limiting, setLimiting] = useState<SocialAccount | null>(null)

  const data = social.data
  const accounts = data?.accounts ?? []
  const setAccounts = (next: SocialAccount[]) => data && social.setData({ ...data, accounts: next })

  // Back from Unipile's sign-in tab: pick the new account up.
  useEffect(() => {
    if (!awaiting || !workspaceId) return
    const back = () => {
      setAwaiting(false)
      const load = data?.notified || !manager ? fetchSocial(workspaceId) : syncSocial(workspaceId)
      load.then((r) => social.setData(r)).catch(() => social.reload())
    }
    window.addEventListener("focus", back, { once: true })
    return () => window.removeEventListener("focus", back)
  }, [awaiting, workspaceId, data?.notified, manager, social])

  const openSignIn = async (key: string, get: () => Promise<{ url: string }>) => {
    setBusy(key)
    // Opened first, then pointed at Unipile: a tab opened after an await is blocked as a pop-up.
    const tab = window.open("about:blank", "_blank")
    try {
      const { url } = await get()
      if (tab) tab.location.href = url
      else window.location.assign(url)
      setAwaiting(true)
      toast.message("Finish signing in on Unipile's page", { description: "Then come back to this tab: the account shows here." })
    } catch (e) {
      tab?.close()
      toast.error("Couldn't open the sign-in", { description: errorText(e) })
    } finally {
      setBusy(null)
    }
  }

  const sync = async () => {
    if (!workspaceId) return
    setBusy("sync")
    try {
      const r = await syncSocial(workspaceId)
      social.setData(r)
      toast.success("Synced with Unipile", { description: `${r.accounts.length} ${r.accounts.length === 1 ? "account" : "accounts"} here.` })
    } catch (e) {
      toast.error("Couldn't sync", { description: errorText(e) })
    } finally {
      setBusy(null)
    }
  }

  const link = async (a: SocialAccount, senderId: string) => {
    if (!workspaceId) return
    try {
      const saved = await linkSocial(workspaceId, a.id, senderId === NONE ? null : senderId)
      setAccounts(accounts.map((x) => (x.id === a.id ? saved : x)))
      toast.success(saved.senderEmail ? `${a.name || a.username} belongs to ${saved.senderEmail}` : `${a.name || a.username} belongs to no mailbox`)
    } catch (e) {
      toast.error("Couldn't change it", { description: errorText(e) })
    }
  }

  const saveLimits = async (a: SocialAccount, limits: { dailyInviteLimit?: number | null; dailyMessageLimit?: number | null }) => {
    if (!workspaceId) return false
    try {
      const saved = await setSocialLimits(workspaceId, a.id, limits)
      setAccounts(accounts.map((x) => (x.id === a.id ? saved : x)))
      toast.success(`Limits saved for ${a.name || a.username}`, { description: limitsText(saved) })
      return true
    } catch (e) {
      toast.error("Couldn't save the limits", { description: errorText(e) })
      return false
    }
  }

  const remove = async () => {
    if (!workspaceId || !removing) return
    const a = removing
    try {
      await disconnectSocial(workspaceId, a.id)
      setAccounts(accounts.filter((x) => x.id !== a.id))
      toast.success(`Disconnected ${a.name || a.username}`)
    } catch (e) {
      toast.error("Couldn't disconnect it", { description: errorText(e) })
    } finally {
      setRemoving(null)
    }
  }

  const here = typeof window !== "undefined" ? window.location.href : ""
  const disabled = !data?.configured

  return (
    <Page
      title="Social accounts"
      description="LinkedIn and Instagram accounts connected through Unipile, and which mailbox each belongs to. Signing in happens on Unipile's page; Coldbrew never sees the password."
      actions={
        manager && (
          <>
            <Button variant="outline" disabled={disabled || busy === "sync"} onClick={() => void sync()}>
              <RefreshCw className={cn(busy === "sync" && "animate-spin")} /> Sync from Unipile
            </Button>
            {(["linkedin", "instagram"] as const).map((p) => {
              const Icon = NETWORK[p].icon
              return (
                <Button key={p} disabled={disabled || busy === p} onClick={() => workspaceId && void openSignIn(p, () => connectSocial(workspaceId, p, here))}>
                  <Icon /> Connect {NETWORK[p].name}
                </Button>
              )
            })}
          </>
        )
      }
    >
      {data && !data.configured && (
        <Notice>
          Unipile isn&apos;t connected yet. Add <code className="font-mono text-[12.5px]">UNIPILE_DSN</code> (your Unipile API address, like
          https://api8.unipile.com:13851) and <code className="font-mono text-[12.5px]">UNIPILE_API_KEY</code> to the backend on Railway, then
          come back here.
        </Notice>
      )}
      {data?.configured && !data.notified && (
        <Notice>
          After signing in on Unipile&apos;s page, come back to this tab and the account is picked up. To have it appear on its own, add{" "}
          <code className="font-mono text-[12.5px]">PUBLIC_API_URL</code> (the backend&apos;s Railway address) on Railway.
        </Notice>
      )}

      {social.error && !data ? (
        <LoadError message={social.error} onRetry={social.reload} />
      ) : !data ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : (
        <div className="space-y-6">
          {(["linkedin", "instagram"] as const).map((p) => (
            <Network
              key={p}
              provider={p}
              accounts={accounts.filter((a) => a.provider === p)}
              mailboxes={senders.data ?? []}
              manager={manager}
              configured={data.configured}
              onLink={link}
              onLimits={setLimiting}
              onReconnect={(a) => workspaceId && void openSignIn(a.id, () => reconnectSocial(workspaceId, a.id, here))}
              onDisconnect={setRemoving}
            />
          ))}
        </div>
      )}

      <LimitsDialog account={limiting} onClose={() => setLimiting(null)} onSave={saveLimits} />

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {removing?.name || removing?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              It&apos;s disconnected from Unipile too, so it stops counting on your Unipile plan. The {removing ? NETWORK[removing.provider].name : ""} account
              itself isn&apos;t touched. You can connect it again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void remove()}>
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-dashed border-data/40 bg-data-soft/40 px-4 py-3">
      <Plug className="mt-0.5 size-4 flex-none text-data" aria-hidden />
      <p className="text-[13.5px] leading-5">{children}</p>
    </div>
  )
}

function limitsText(a: SocialAccount) {
  return a.provider === "linkedin"
    ? `${a.invitesPerDay} connection requests (${a.invitesPerWeek} a week) and ${a.messagesPerDay} messages a day`
    : `${a.messagesPerDay} messages a day`
}

/** An account's own daily limits. Empty: the workspace's for its network, from Settings. */
function LimitsDialog({ account, onClose, onSave }: {
  account: SocialAccount | null
  onClose: () => void
  onSave: (a: SocialAccount, limits: { dailyInviteLimit?: number | null; dailyMessageLimit?: number | null }) => Promise<boolean>
}) {
  const [invites, setInvites] = useState("")
  const [messages, setMessages] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shown, setShown] = useState<string | null>(null)
  if (account && shown !== account.id) {
    setShown(account.id)
    setInvites(account.dailyInviteLimit === null ? "" : String(account.dailyInviteLimit))
    setMessages(account.dailyMessageLimit === null ? "" : String(account.dailyMessageLimit))
    setError(null)
  }
  const linkedin = account?.provider === "linkedin"

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!account || busy) return
    const inv = invites ? Number(invites) : null
    const msg = messages ? Number(messages) : null
    if (inv !== null && (inv < 1 || inv > 100)) return setError("Connection requests a day: between 1 and 100.")
    if (msg !== null && (msg < 1 || msg > 250)) return setError("Messages a day: between 1 and 250.")
    setBusy(true)
    const ok = await onSave(account, linkedin ? { dailyInviteLimit: inv, dailyMessageLimit: msg } : { dailyMessageLimit: msg })
    setBusy(false)
    if (ok) {
      setShown(null)
      onClose()
    }
  }

  return (
    <Dialog open={!!account} onOpenChange={(open) => !open && (setShown(null), onClose())}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>Limits for {account?.name || account?.username}</DialogTitle>
            <DialogDescription>Leave a box empty to use this workspace&apos;s limit for {linkedin ? "LinkedIn" : "Instagram"}, set in Settings.</DialogDescription>
          </DialogHeader>
          {linkedin && (
            <div className="space-y-1.5">
              <Label htmlFor="own-invites">Connection requests a day</Label>
              <Input id="own-invites" inputMode="numeric" placeholder="Workspace's" value={invites} onChange={(e) => setInvites(e.target.value.replace(/\D/g, ""))} />
              <p className="text-[12.5px] text-muted-foreground">The workspace&apos;s weekly limit ({account?.invitesPerWeek}) still applies.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="own-messages">Messages a day</Label>
            <Input id="own-messages" inputMode="numeric" placeholder="Workspace's" value={messages} onChange={(e) => setMessages(e.target.value.replace(/\D/g, ""))} />
          </div>
          {error && (
            <p role="alert" className="text-[13px] text-negative">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => (setShown(null), onClose())}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save limits"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Network({ provider, accounts, mailboxes, manager, configured, onLink, onLimits, onReconnect, onDisconnect }: {
  provider: SocialProvider
  accounts: SocialAccount[]
  mailboxes: Sender[]
  manager: boolean
  configured: boolean
  onLink: (a: SocialAccount, senderId: string) => void
  onLimits: (a: SocialAccount) => void
  onReconnect: (a: SocialAccount) => void
  onDisconnect: (a: SocialAccount) => void
}) {
  const { name, icon: Icon } = NETWORK[provider]
  return (
    <section aria-labelledby={`${provider}-title`} className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2.5 border-b px-5 py-3">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        <h2 id={`${provider}-title`} className="text-[14px] font-semibold">
          {name}
        </h2>
        <span className="text-[12.5px] text-muted-foreground tabular-nums">{accounts.length}</span>
      </div>
      {accounts.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13.5px] text-muted-foreground">
          {configured ? `No ${name} account yet. Connect one with the button above.` : `${name} accounts show here once Unipile is connected.`}
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {accounts.map((a) => {
            const status = STATUS[a.status]
            return (
              <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-x-4 gap-y-2 px-5 py-3.5 md:grid-cols-[minmax(0,1.6fr)_140px_minmax(0,1.4fr)_40px]">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{a.name || a.username}</p>
                  {a.username && <p className="truncate text-[12.5px] text-muted-foreground">@{a.username}</p>}
                  <p className="truncate text-[12.5px] text-muted-foreground tabular-nums">
                    {limitsText(a)}
                    {(a.dailyInviteLimit !== null || a.dailyMessageLimit !== null) && " (its own)"}
                  </p>
                </div>
                <div className="col-start-1 md:col-start-auto">
                  <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium whitespace-nowrap", status.className)}>
                    <span aria-hidden className="size-1.5 rounded-full bg-current" />
                    {status.label}
                  </span>
                </div>
                <div className="col-start-1 md:col-start-auto">
                  <Select value={a.senderAccountId ?? NONE} disabled={!manager} onValueChange={(v) => onLink(a, v)}>
                    <SelectTrigger className="w-full max-w-72" aria-label={`Mailbox ${a.name || a.username} belongs to`}>
                      <SelectValue placeholder="Belongs to…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No mailbox</SelectItem>
                      {mailboxes.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.fromEmail}
                          {m.pool === "warming" ? " (warming)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-start-2 row-span-3 row-start-1 flex justify-end md:col-start-auto md:row-span-1 md:row-start-auto">
                  {manager && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${a.name || a.username}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-48">
                        <DropdownMenuItem onSelect={() => onLimits(a)}>
                          <Gauge /> Set limits
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={!configured} onSelect={() => onReconnect(a)}>
                          <RotateCcw /> Sign in again
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => onDisconnect(a)}>
                          <Unplug /> Disconnect
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
