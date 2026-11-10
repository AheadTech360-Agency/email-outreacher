"use client"

import { useState } from "react"
import { MoreHorizontal, Pause, Pencil, Play, Plus, PlugZap, Search, Trash2 } from "lucide-react"
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
import { type Sender, canManage, deleteSender, errorText, fetchPersonas, fetchSenders, pauseSender, testSender, useApi } from "@/lib/config-api"
import { providerOf } from "@/lib/config-providers"
import { useSession } from "@/lib/config-session"
import { cn } from "@/lib/utils"

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Never"

export default function SendersPage() {
  const { workspaceId, me } = useSession()
  const manager = canManage(me?.role)
  const senders = useApi(() => (workspaceId ? fetchSenders(workspaceId) : Promise.resolve([])), [workspaceId])
  const personas = useApi(() => (workspaceId ? fetchPersonas(workspaceId) : Promise.resolve([])), [workspaceId])
  // From Overview's "Add a mailbox" (/senders?add=1).
  const [editing, setEditing] = useState<Sender | "new" | null>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("add") === "1" ? "new" : null,
  )
  const [removing, setRemoving] = useState<Sender | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  const list = senders.data ?? []
  const q = query.trim().toLowerCase()
  const shown = q
    ? list.filter((s) => [s.fromEmail, s.fromName, s.label, s.personaName ?? ""].some((v) => v.toLowerCase().includes(q)))
    : list
  const replace = (s: Sender) => senders.setData(list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [...list, s])

  const test = async (s: Sender) => {
    if (!workspaceId) return
    setBusy(s.id)
    try {
      const r = await testSender(workspaceId, s.id)
      replace(r.account)
      if (r.ok) toast.success(`${s.fromEmail} is connected`, { description: r.imapChecked ? "Sending and reading replies both work." : "Sending works." })
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

  const remove = async () => {
    if (!workspaceId || !removing) return
    const s = removing
    try {
      await deleteSender(workspaceId, s.id)
      senders.setData(list.filter((x) => x.id !== s.id))
      toast.success(`Deleted ${s.fromEmail}`, { description: "Its saved passwords were deleted too." })
    } catch (e) {
      toast.error("Couldn't delete it", { description: errorText(e) })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <Page
      title="Sender accounts"
      description="The mailboxes Coldbrew sends from and reads replies in. Testing only signs in; nothing is sent."
      actions={
        manager && (
          <Button onClick={() => setEditing("new")}>
            <Plus /> Add a mailbox
          </Button>
        )
      }
    >
      {senders.error && !senders.data ? (
        <LoadError message={senders.error} onRetry={senders.reload} />
      ) : (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Search mailboxes" placeholder="Search address, name or persona" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_40px] gap-4 border-b bg-muted/50 px-5 py-2.5 text-[12.5px] font-medium text-muted-foreground md:grid">
              <span>Mailbox</span>
              <span>Status</span>
              <span>Today</span>
              <span>Last checked</span>
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
                <p className="text-[14px] font-medium">{list.length ? "No mailbox matches" : "No mailboxes yet"}</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {list.length ? "Try another search." : manager ? "Add one to start sending from Coldbrew." : "Management or an admin can add one."}
                </p>
                {!list.length && manager && (
                  <Button className="mt-4" onClick={() => setEditing("new")}>
                    <Plus /> Add a mailbox
                  </Button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-rule">
                {shown.map((s) => {
                  const used = Math.min(1, s.sentToday / s.dailyLimit)
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        "grid grid-cols-[minmax(0,1fr)_40px] items-center gap-x-4 gap-y-2 px-5 py-3.5 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_40px]",
                        manager && "cursor-pointer transition-colors hover:bg-muted/40",
                      )}
                      onClick={() => manager && setEditing(s)}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium">{s.fromEmail}</p>
                        <p className="truncate text-[12.5px] text-muted-foreground">
                          {[s.fromName || s.personaName, providerOf(s.provider).name, s.imapHost ? "Reads replies" : "Replies not read", s.label].filter(Boolean).join(", ")}
                        </p>
                      </div>
                      <div className="col-start-1 md:col-start-auto">
                        <SenderStatusPill status={s.status} />
                      </div>
                      <div className="col-start-1 flex items-center gap-3 md:col-start-auto">
                        <div className="h-1.5 w-full max-w-28 overflow-hidden rounded-full bg-track" aria-hidden>
                          <div className="h-full rounded-full bg-data" style={{ width: `${used * 100}%` }} />
                        </div>
                        <span className="text-[12.5px] whitespace-nowrap text-muted-foreground tabular-nums">
                          {s.sentToday} of {s.dailyLimit}
                        </span>
                      </div>
                      <p className="col-start-1 text-[12.5px] text-muted-foreground md:col-start-auto" title={s.lastError ?? undefined}>
                        {when(s.lastCheckedAt)}
                      </p>
                      <div className="col-start-2 row-span-4 row-start-1 flex justify-end md:col-start-auto md:row-span-1 md:row-start-auto" onClick={(e) => e.stopPropagation()}>
                        {manager && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={`Actions for ${s.fromEmail}`} disabled={busy === s.id}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-48">
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
                  )
                })}
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
              Coldbrew stops sending from it and deletes its saved passwords. The mailbox itself isn&apos;t touched. To stop it for a while instead,
              pause it.
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
