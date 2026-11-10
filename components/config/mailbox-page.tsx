"use client"

import { useState } from "react"
import { ArrowLeftRight, Flame, MoreHorizontal, Pause, Pencil, Play, Plus, PlugZap, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { LoadError } from "@/components/config/load-error"
import { SenderSheet } from "@/components/config/sender-sheet"
import { SenderStatusPill } from "@/components/config/sender-status"
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  type Pool,
  type Sender,
  canManage,
  deleteSender,
  errorText,
  fetchPersonas,
  fetchSenders,
  fetchSendingStatus,
  moveSender,
  pauseSender,
  testSender,
  useApi,
} from "@/lib/config-api"
import { providerOf } from "@/lib/config-providers"
import { useSession } from "@/lib/config-session"
import { cn } from "@/lib/utils"

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Never"
const pct = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`)

const COPY: Record<Pool, { title: string; description: string; add: string; empty: string }> = {
  sending: {
    title: "Sending accounts",
    description: "The mailboxes campaigns send from and read replies in. Testing only signs in; nothing is sent.",
    add: "Add a sending mailbox",
    empty: "Add one to send campaigns from it, or move a warmed-up mailbox here from Warming accounts.",
  },
  warming: {
    title: "Warming accounts",
    description: "Mailboxes warming up: they email each other, then open, rescue from spam, star and reply, so providers learn to trust them. Move one to Sending accounts when it's ready.",
    add: "Add a warming mailbox",
    empty: "Add two or more new mailboxes here to warm them up before they send campaigns.",
  },
}

/** Sending accounts and Warming accounts: the same mailboxes, in one pool or the other, moved between them here. */
export function MailboxPage({ pool }: { pool: Pool }) {
  const { workspaceId, me } = useSession()
  const manager = canManage(me?.role)
  const senders = useApi(() => (workspaceId ? fetchSenders(workspaceId) : Promise.resolve([])), [workspaceId])
  const personas = useApi(() => (workspaceId ? fetchPersonas(workspaceId) : Promise.resolve([])), [workspaceId])
  const status = useApi(fetchSendingStatus, [])
  // From Overview's "Add a mailbox" (?add=1).
  const [editing, setEditing] = useState<Sender | "new" | null>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("add") === "1" ? "new" : null,
  )
  const [removing, setRemoving] = useState<Sender | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const copy = COPY[pool]
  const other: Pool = pool === "sending" ? "warming" : "sending"

  const all = senders.data ?? []
  const list = all.filter((s) => s.pool === pool)
  const q = query.trim().toLowerCase()
  const shown = q ? list.filter((s) => [s.fromEmail, s.fromName, s.label, s.personaName ?? ""].some((v) => v.toLowerCase().includes(q))) : list
  const replace = (s: Sender) => senders.setData(all.some((x) => x.id === s.id) ? all.map((x) => (x.id === s.id ? s : x)) : [...all, s])

  const test = async (s: Sender) => {
    if (!workspaceId) return
    setBusy(s.id)
    try {
      const r = await testSender(workspaceId, s.id)
      replace(r.account)
      if (r.ok) toast.success(`${s.fromEmail} is connected`, { description: r.imapChecked ? "Sending and reading both work." : "Sending works." })
      else toast.error(`${s.fromEmail} can't connect`, { description: [r.smtpError, r.imapError].filter(Boolean).join(" ") })
    } catch (e) {
      toast.error("Couldn't run the check", { description: errorText(e) })
    } finally {
      setBusy(null)
    }
  }

  const togglePause = async (s: Sender) => {
    if (!workspaceId) return
    const pausing = s.status !== "paused"
    try {
      replace(await pauseSender(workspaceId, s.id, pausing))
      toast.success(pausing ? `Paused ${s.fromEmail}` : `Resumed ${s.fromEmail}`, {
        description: pausing ? "Nothing is sent from it until it's resumed." : "Test it before Coldbrew sends from it again.",
      })
    } catch (e) {
      toast.error(pausing ? "Couldn't pause it" : "Couldn't resume it", { description: errorText(e) })
    }
  }

  const move = async (s: Sender) => {
    if (!workspaceId) return
    try {
      replace(await moveSender(workspaceId, s.id, other))
      toast.success(other === "warming" ? `${s.fromEmail} is warming up` : `${s.fromEmail} can send campaigns now`, {
        description: other === "warming" ? "It's in Warming accounts, starting at 3 warm-up emails a day." : "It's in Sending accounts.",
      })
    } catch (e) {
      toast.error(other === "warming" ? "Couldn't move it to warming" : "Couldn't move it to sending", { description: errorText(e) })
    }
  }

  const remove = async () => {
    if (!workspaceId || !removing) return
    const s = removing
    try {
      await deleteSender(workspaceId, s.id)
      senders.setData(all.filter((x) => x.id !== s.id))
      toast.success(`Deleted ${s.fromEmail}`, { description: "Its saved passwords were deleted too." })
    } catch (e) {
      toast.error("Couldn't delete it", { description: errorText(e) })
    } finally {
      setRemoving(null)
    }
  }

  const grid =
    pool === "sending"
      ? "md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_40px]"
      : "md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_40px]"

  return (
    <Page
      title={copy.title}
      description={copy.description}
      actions={
        manager && (
          <Button onClick={() => setEditing("new")}>
            <Plus /> {copy.add}
          </Button>
        )
      }
    >
      {pool === "warming" && senders.data && <WarmingSummary list={list} live={status.data?.warmupLive} />}
      {senders.error && !senders.data ? (
        <LoadError message={senders.error} onRetry={senders.reload} />
      ) : (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Search mailboxes" placeholder="Search address, name or persona" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          <div className="overflow-hidden rounded-xl border bg-card">
            <div className={cn("hidden gap-4 border-b bg-muted/50 px-5 py-2.5 text-[12.5px] font-medium text-muted-foreground md:grid", grid)}>
              <span>Mailbox</span>
              <span>Status</span>
              {pool === "sending" ? (
                <>
                  <span>Today</span>
                  <span>Last checked</span>
                </>
              ) : (
                <>
                  <span>Warm-up today</span>
                  <span>Inbox placement (7 days)</span>
                  <span>Replies, rescued</span>
                </>
              )}
              <span className="sr-only">Actions</span>
            </div>

            {!senders.data ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : shown.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-[14px] font-medium">{list.length ? "No mailbox matches" : `No ${pool} mailboxes yet`}</p>
                <p className="mx-auto mt-1 max-w-[52ch] text-[13px] text-muted-foreground">
                  {list.length ? "Try another search." : manager ? copy.empty : "Management or an admin can add one."}
                </p>
                {!list.length && manager && (
                  <Button className="mt-4" onClick={() => setEditing("new")}>
                    <Plus /> {copy.add}
                  </Button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-rule">
                {shown.map((s) => (
                  <li
                    key={s.id}
                    className={cn("grid grid-cols-[minmax(0,1fr)_40px] items-center gap-x-4 gap-y-2 px-5 py-3.5", grid, manager && "cursor-pointer transition-colors hover:bg-muted/40")}
                    onClick={() => manager && setEditing(s)}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium">{s.fromEmail}</p>
                      <p className="truncate text-[12.5px] text-muted-foreground">
                        {[s.fromName || s.personaName, providerOf(s.provider).name, s.imapHost ? "Reads its inbox" : "Inbox not read", s.label].filter(Boolean).join(", ")}
                      </p>
                    </div>
                    <div className="col-start-1 md:col-start-auto">
                      <SenderStatusPill status={s.status} />
                    </div>
                    {pool === "sending" ? (
                      <>
                        <Meter value={s.sentToday} max={s.dailyLimit} label={`${s.sentToday} of ${s.dailyLimit}`} />
                        <p className="col-start-1 text-[12.5px] text-muted-foreground md:col-start-auto" title={s.lastError ?? undefined}>
                          {when(s.lastCheckedAt)}
                        </p>
                      </>
                    ) : (
                      <>
                        <Meter value={s.warmupSentToday} max={Math.max(1, s.warmupTargetToday)} label={`${s.warmupSentToday} of ${s.warmupTargetToday}`} />
                        <Meter
                          value={Math.round((s.warmupInboxRate7d ?? 0) * 100)}
                          max={100}
                          label={s.warmupInboxRate7d === null ? "Not measured yet" : `${pct(s.warmupInboxRate7d)} of ${s.warmupReceived7d}`}
                          tone={s.warmupInboxRate7d !== null && s.warmupInboxRate7d < 0.8 ? "warn" : undefined}
                        />
                        <p className="col-start-1 text-[12.5px] text-muted-foreground tabular-nums md:col-start-auto">
                          {s.warmupReplied7d} replies, {s.warmupRescued7d} rescued
                        </p>
                      </>
                    )}
                    <div className="col-start-2 row-span-5 row-start-1 flex justify-end md:col-start-auto md:row-span-1 md:row-start-auto" onClick={(e) => e.stopPropagation()}>
                      {manager && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${s.fromEmail}`} disabled={busy === s.id}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-52">
                            <DropdownMenuItem onSelect={() => void move(s)}>
                              {other === "warming" ? <Flame /> : <ArrowLeftRight />} {other === "warming" ? "Move to warming" : "Move to sending"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => void test(s)}>
                              <PlugZap /> Test connection
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setEditing(s)}>
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => void togglePause(s)}>
                              {s.status === "paused" ? <Play /> : <Pause />} {s.status === "paused" ? "Resume" : "Pause"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(s)}>
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {editing && workspaceId && (
        <SenderSheet
          wsId={workspaceId}
          sender={editing === "new" ? null : editing}
          personas={personas.data ?? []}
          pool={pool}
          onClose={() => setEditing(null)}
          onSaved={(s) => {
            replace(s)
            setEditing(null)
          }}
        />
      )}

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {removing?.fromEmail}?</AlertDialogTitle>
            <AlertDialogDescription>
              Coldbrew stops using it and deletes its saved passwords. The mailbox itself isn&apos;t touched. To stop it for a while instead, pause it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void remove()}>
              Delete {removing?.fromEmail}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  )
}

function Meter({ value, max, label, tone }: { value: number; max: number; label: string; tone?: "warn" }) {
  return (
    <div className="col-start-1 flex items-center gap-3 md:col-start-auto">
      <div className="h-1.5 w-full max-w-28 overflow-hidden rounded-full bg-track" aria-hidden>
        <div className={cn("h-full rounded-full", tone === "warn" ? "bg-warning" : "bg-data")} style={{ width: `${Math.min(1, value / max) * 100}%` }} />
      </div>
      <span className="text-[12.5px] whitespace-nowrap text-muted-foreground tabular-nums">{label}</span>
    </div>
  )
}

/** The warming pool at a glance, and why it might not be running. */
function WarmingSummary({ list, live }: { list: Sender[]; live: boolean | undefined }) {
  const connected = list.filter((s) => s.status === "ok")
  const sent = connected.reduce((n, s) => n + s.warmupSentToday, 0)
  const target = connected.reduce((n, s) => n + s.warmupTargetToday, 0)
  const received = list.reduce((n, s) => n + s.warmupReceived7d, 0)
  const measured = list.filter((s) => s.warmupInboxRate7d !== null)
  const inbox = measured.length ? measured.reduce((n, s) => n + (s.warmupInboxRate7d ?? 0) * s.warmupReceived7d, 0) / Math.max(1, measured.reduce((n, s) => n + s.warmupReceived7d, 0)) : null
  const notice =
    connected.length < 2
      ? `Warming needs at least two connected warming mailboxes (they only email each other). ${connected.length ? "Add one more" : "Add two"}, then test them.`
      : live === false
        ? "Dry run: warm-up emails are only logged, nothing is sent or opened. Turn on OWN_WARMUP_LIVE on Railway to warm for real."
        : null
  return (
    <div className="mb-6 space-y-4">
      {notice && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-dashed border-data/40 bg-data-soft/40 px-4 py-3">
          <Flame className="mt-0.5 size-4 flex-none text-data" aria-hidden />
          <p className="text-[13.5px] leading-5">{notice}</p>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-rule sm:grid-cols-4">
        {[
          ["Warming mailboxes", `${connected.length} connected`, `${list.length} in all`],
          ["Warm-up emails today", sent.toLocaleString(), `of ${target.toLocaleString()} planned`],
          ["Received, 7 days", received.toLocaleString(), "opened by the mailboxes"],
          ["Inbox placement, 7 days", pct(inbox), inbox === null ? "after the first opens" : "landed in the inbox, not spam"],
        ].map(([label, value, sub]) => (
          <div key={label} className="bg-card px-4 py-3.5">
            <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
            <dd className="mt-0.5">
              <span className="text-[22px] leading-7 font-semibold tabular-nums">{value}</span>
              <span className="ml-2 text-[12px] text-muted-foreground">{sub}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
