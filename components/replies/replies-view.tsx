"use client"

import { FacetFilters } from "@/components/facet-filters"
import { choices, presenceMatches, recentMatches, textMatches, PRESENCE_OPTIONS, RECENT_OPTIONS } from "@/lib/facets"
import { ListTools } from "@/components/list-tools"
import { Input } from "@/components/ui/input"

import { useState } from "react"
import { Inbox, RotateCw } from "lucide-react"
import { BackendError, WorkspaceGate } from "@/components/companies/backend-state"
import { EmptyState } from "@/components/empty-state"
import { Pill } from "@/components/status"
import { TableSkeleton } from "@/components/table-skeleton"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { type ReplyThread, fetchReplies, fetchReplyThread, useApi } from "@/lib/api"
import { fullDate, shortDate } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Conversations where a lead wrote back, read from CheapSequencer's inbox. Nothing is answered or marked read here. */
export function RepliesView() {
  return <WorkspaceGate>{(wsId) => <Replies key={wsId} wsId={wsId} />}</WorkspaceGate>
}

function Replies({ wsId }: { wsId: string }) {
  const threads = useApi(() => fetchReplies(wsId), [wsId])
  const [openId, setOpenId] = useState<string | null>(null)
  // From the reply email's link (/replies?open=<their address>): the list starts searched for them, and their
  // conversation opens once it's loaded (until it's closed).
  const [linked] = useState(() =>
    typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("open") ?? "").trim().toLowerCase(),
  )
  const [linkClosed, setLinkClosed] = useState(false)
  const [query, setQuery] = useState(linked)
  const [extra, setExtra] = useState<Record<string, string>>({})

  if (threads.error && !threads.data) return <BackendError message={threads.error} onRetry={threads.reload} />
  if (!threads.data) return <TableSkeleton rows={6} />

  const visible = threads.data.filter((t) => textMatches(query,t.leadName,t.leadEmail,t.subject,t.preview,t.campaign,t.mailbox) &&
    (!extra.campaign || extra.campaign === "all" || t.campaign === extra.campaign) &&
    (!extra.mailbox || extra.mailbox === "all" || t.mailbox === extra.mailbox) &&
    (!extra.classification || extra.classification === "all" || (t.classification || "unclassified") === extra.classification) &&
    presenceMatches(t.unreadCount, extra.unread) && recentMatches(t.lastMessageAt, extra.date))
  const open =
    threads.data.find((t) => t.id === openId) ??
    (linked && !linkClosed ? threads.data.find((t) => t.leadEmail?.toLowerCase() === linked) : undefined) ??
    null

  return (
    <div className="space-y-4">
      <ListTools wsId={wsId} scope="replies" filters={{query,...extra}} onApply={(v)=>{setQuery(v.query ?? "");setExtra(Object.fromEntries(["campaign","mailbox","classification","unread","date"].filter((key)=>v[key]).map((key)=>[key,v[key]])))}} onRefresh={threads.reload} />
      <Input aria-label="Search replies" placeholder="Search person, email, subject or reply text" value={query} onChange={(e)=>setQuery(e.target.value)} />
      <FacetFilters values={extra} onChange={setExtra} count={visible.length} fields={[{key:"campaign",label:"Reply campaign",options:choices(threads.data.map((t)=>t.campaign))},{key:"mailbox",label:"Receiving mailbox",options:choices(threads.data.map((t)=>t.mailbox))},{key:"classification",label:"Reply classification",options:choices(threads.data.map((t)=>t.classification || "unclassified"))},{key:"unread",label:"Unread messages",options:PRESENCE_OPTIONS},{key:"date",label:"Last message date",options:RECENT_OPTIONS}]} />
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[13px] text-muted-foreground">
          {visible.length} of {threads.data.length} conversation{threads.data.length === 1 ? "" : "s"} with a reply. To answer, use the inbox in CheapSequencer or the
          mailbox itself.
        </p>
        <Button size="sm" variant="outline" onClick={threads.reload} disabled={threads.loading}>
          <RotateCw /> Refresh
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={threads.data.length ? "No matching replies" : "No replies yet"}
          description={threads.data.length ? "Change the search or clear extra filters." : "When a lead writes back, the conversation appears here and their follow-ups stop."}
        />
      ) : (
        <ul className="divide-y divide-rule overflow-hidden rounded-lg border">
          {visible.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setOpenId(t.id)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
              >
                <span
                  aria-hidden
                  className={cn("mt-1.5 size-2 flex-none rounded-full", t.unreadCount ? "bg-data" : "bg-transparent")}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={cn("truncate text-sm", t.unreadCount ? "font-semibold" : "font-medium")}>
                      {t.leadName || t.leadEmail}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{t.campaign.replace(/^Coldbrew: /, "")}</span>
                    <span className="ml-auto flex-none text-xs text-muted-foreground tabular-nums">
                      {t.lastMessageAt ? shortDate(t.lastMessageAt) : ""}
                    </span>
                  </span>
                  <span className="block truncate text-[13px]">{t.subject}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">{t.preview}</span>
                </span>
                {t.classification && <Pill tone={t.classification === "interested" ? "positive" : "neutral"}>{t.classification}</Pill>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <ThreadSheet wsId={wsId} thread={open} onClose={() => (setOpenId(null), setLinkClosed(true))} />}
    </div>
  )
}

function ThreadSheet({ wsId, thread, onClose }: { wsId: string; thread: ReplyThread; onClose: () => void }) {
  const detail = useApi(() => fetchReplyThread(wsId, thread.id), [wsId, thread.id])
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full! gap-0 overflow-y-auto sm:max-w-xl!">
        <SheetHeader className="px-5 pt-5 pb-4">
          <SheetTitle className="text-lg">{thread.leadName || thread.leadEmail}</SheetTitle>
          <SheetDescription>
            {thread.leadEmail} · {thread.campaign} · with {thread.mailbox}
          </SheetDescription>
        </SheetHeader>
        {detail.error && <p className="border-t border-rule px-5 py-4 text-sm text-destructive">Couldn&apos;t load it: {detail.error}</p>}
        {!detail.data && !detail.error && (
          <div className="space-y-3 border-t border-rule px-5 py-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {detail.data?.messages.map((m) => (
          <section
            key={m.id}
            className={cn("space-y-1.5 border-t border-rule px-5 py-4", m.direction === "inbound" && "bg-data/5")}
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[13px] font-medium">
                {m.direction === "inbound" ? thread.leadName || m.fromName || m.fromAddress : m.fromName || m.fromAddress}
              </span>
              <span className="text-xs text-muted-foreground">{m.direction === "inbound" ? "replied" : "sent"}</span>
              {m.sentAt && <span className="ml-auto text-xs text-muted-foreground">{fullDate(m.sentAt)} UTC</span>}
            </div>
            <p className="text-[13px] leading-relaxed whitespace-pre-line">{m.body.trim()}</p>
          </section>
        ))}
      </SheetContent>
    </Sheet>
  )
}
