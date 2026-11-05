"use client"

import { FacetFilters } from "@/components/facet-filters"
import { choices, presenceMatches, recentMatches, PRESENCE_OPTIONS, RECENT_OPTIONS } from "@/lib/facets"
import { ListTools } from "@/components/list-tools"

import Link from "next/link"
import { useState } from "react"
import { Check, Circle, Minus, RotateCw, Search, Send } from "lucide-react"
import { BackendError, WorkspaceGate } from "@/components/companies/backend-state"
import { EmptyState } from "@/components/empty-state"
import { Pill, type PillTone } from "@/components/status"
import { TableSkeleton } from "@/components/table-skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { type OutboxRow, type OutboxState, type OutboxStep, fetchOutbox, useApi } from "@/lib/api"
import { fullDate, shortDate } from "@/lib/format"
import { cn } from "@/lib/utils"

const STATE: Record<OutboxState, { label: string; tone: PillTone }> = {
  queued: { label: "Queued", tone: "info" },
  sending: { label: "Sending", tone: "info" },
  replied: { label: "Replied", tone: "positive" },
  bounced: { label: "Bounced", tone: "negative" },
  unsubscribed: { label: "Unsubscribed", tone: "warning" },
  failed: { label: "Failed", tone: "negative" },
  paused: { label: "Paused", tone: "warning" },
  stopped: { label: "Stopped", tone: "neutral" },
  finished: { label: "Finished", tone: "neutral" },
}

const FILTERS: { value: string; label: string; test: (s: OutboxState) => boolean }[] = [
  { value: "all", label: "All", test: () => true },
  { value: "queued", label: "Queued", test: (s) => s === "queued" },
  { value: "sending", label: "Sending", test: (s) => s === "sending" || s === "paused" },
  { value: "replied", label: "Replied", test: (s) => s === "replied" },
  { value: "bounced", label: "Bounced or unsubscribed", test: (s) => s === "bounced" || s === "unsubscribed" || s === "failed" },
  { value: "finished", label: "Finished", test: (s) => s === "finished" || s === "stopped" },
]

/** Everything Coldbrew queued into CheapSequencer: who, from which mailbox, and which of the five emails went out. */
export function OutboxView() {
  return <WorkspaceGate>{(wsId) => <Outbox key={wsId} wsId={wsId} />}</WorkspaceGate>
}

function Outbox({ wsId }: { wsId: string }) {
  const rows = useApi(() => fetchOutbox(wsId), [wsId])
  const [filter, setFilter] = useState("all")
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [query, setQuery] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)

  if (rows.error && !rows.data) return <BackendError message={rows.error} onRetry={rows.reload} />
  if (!rows.data) return <TableSkeleton rows={6} />

  const all = rows.data
  const q = query.trim().toLowerCase()
  const visible = all.filter(
    (r) =>
      FILTERS.find((f) => f.value === filter)!.test(r.state) &&
      (!extra.campaign || extra.campaign === "all" || r.campaign === extra.campaign) &&
      (!extra.mailbox || extra.mailbox === "all" || r.mailbox === extra.mailbox) && presenceMatches(r.mailbox, extra.assigned) &&
      recentMatches(r.lastSentAt, extra.sentDate) &&
      (!extra.progress || extra.progress === "all" || (extra.progress === "none" ? r.sent === 0 : extra.progress === "started" ? r.sent > 0 && r.sent < r.steps.length : r.steps.length > 0 && r.sent >= r.steps.length)) &&
      presenceMatches(r.steps.slice(1).some((step) => step.personalized), extra.personalized) &&
      (!q || `${r.name} ${r.email} ${r.company} ${r.campaign} ${r.mailbox ?? ""}`.toLowerCase().includes(q)),
  )
  const open = all.find((r) => r.emailId === openId) ?? null
  const synced = all.map((r) => r.syncedAt).filter(Boolean).sort().at(-1)

  if (all.length === 0)
    return (
      <EmptyState
        icon={Send}
        title="Nothing queued yet"
        description="Approve emails on the Review page, then choose Queue for sending. They show up here with their follow-ups."
        action={
          <Button asChild variant="outline">
            <Link href="/review">Go to Review</Link>
          </Button>
        }
      />
    )

  return (
    <div className="space-y-4">
      <ListTools wsId={wsId} scope="outbox" filters={{query, filter, ...extra}} onApply={(v) => {setQuery(v.query ?? "");setFilter(FILTERS.some((f)=>f.value===v.filter)?v.filter:"all");setExtra(Object.fromEntries(["campaign","mailbox","assigned","sentDate","progress","personalized"].filter((key)=>v[key]).map((key)=>[key,v[key]])))}} onRefresh={rows.reload} />
      <FacetFilters values={extra} onChange={setExtra} count={visible.length} fields={[{key:"campaign",label:"Campaign",options:choices(all.map((r)=>r.campaign))},{key:"mailbox",label:"Sending mailbox",options:choices(all.map((r)=>r.mailbox))},{key:"assigned",label:"Mailbox assignment",options:PRESENCE_OPTIONS},{key:"progress",label:"Sequence progress",options:[{value:"none",label:"Nothing sent yet"},{value:"started",label:"Partly sent"},{value:"completed",label:"All steps sent"}]},{key:"personalized",label:"Personalized follow-ups",options:PRESENCE_OPTIONS},{key:"sentDate",label:"Last sent date",options:RECENT_OPTIONS}]} />
      <div className="flex flex-wrap items-center gap-1.5">
        <div role="tablist" aria-label="Filter the outbox" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                filter === f.value ? "border-data bg-data/10 font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {f.label} <span className="tabular-nums opacity-70">{all.filter((r) => f.test(r.state)).length}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search the outbox"
            placeholder="Name, email, company or mailbox"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Send} title="Nothing here" description="Try another filter or search." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Sends from</TableHead>
                <TableHead>Emails</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.emailId} className="cursor-pointer" onClick={() => setOpenId(r.emailId)}>
                  <TableCell className="max-w-56">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="truncate text-[13px] text-muted-foreground">{r.company || r.email}</p>
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-muted-foreground">{r.campaign.replace(/^Coldbrew: /, "")}</TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">{r.mailbox ?? "Not assigned yet"}</TableCell>
                  <TableCell>
                    <Steps steps={r.steps} />
                  </TableCell>
                  <TableCell>
                    <Pill tone={STATE[r.state].tone}>{STATE[r.state].label}</Pill>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{r.lastSentAt ? shortDate(r.lastSentAt) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          {synced ? `Last checked with CheapSequencer ${fullDate(synced)} UTC.` : "Not checked with CheapSequencer yet."} Statuses update every 30
          minutes.
        </span>
        <Button size="sm" variant="ghost" className="h-7" onClick={rows.reload} disabled={rows.loading}>
          <RotateCw /> Refresh
        </Button>
      </div>

      {open && <LeadSheet row={open} onClose={() => setOpenId(null)} />}
    </div>
  )
}

/** Three marks, one per email: sent, waiting or skipped. */
function Steps({ steps }: { steps: OutboxStep[] }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={steps.map((s) => `Email ${s.step}: ${s.status}`).join(", ")}>
      {steps.map((s) => (
        <span
          key={s.step}
          title={`Email ${s.step}: ${s.status}`}
          className={cn(
            "inline-flex size-5 items-center justify-center rounded-full border text-[10px]",
            s.status === "sent" && "border-data bg-data text-white",
            s.status === "waiting" && "border-data/40 text-data",
            s.status === "skipped" && "border-dashed text-muted-foreground",
          )}
        >
          {s.status === "sent" ? <Check className="size-3" /> : s.status === "skipped" ? <Minus className="size-3" /> : <Circle className="size-2" />}
        </span>
      ))}
    </span>
  )
}

const STEP_STATUS: Record<OutboxStep["status"], string> = { sent: "Sent", waiting: "Not sent yet", skipped: "Won't be sent" }

function LeadSheet({ row, onClose }: { row: OutboxRow; onClose: () => void }) {
  const subject = row.steps[0]?.subject ?? ""
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full! gap-0 overflow-y-auto sm:max-w-xl!">
        <SheetHeader className="px-5 pt-5 pb-4">
          <SheetTitle className="text-lg">{row.name}</SheetTitle>
          <SheetDescription>
            {[row.title, row.company].filter(Boolean).join(" at ") || "No title"} · {row.email}
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Pill tone={STATE[row.state].tone}>{STATE[row.state].label}</Pill>
            <span className="text-xs text-muted-foreground">
              {row.campaign} · {row.mailbox ? `all five from ${row.mailbox}` : "mailbox assigned when the campaign starts"}
            </span>
          </div>
        </SheetHeader>
        {row.steps.map((s) => (
          <section key={s.step} className="space-y-2 border-t border-rule px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Email {s.step}</h3>
              <Pill tone={s.status === "sent" ? "positive" : "neutral"}>{STEP_STATUS[s.status]}</Pill>
              {s.sentAt && <span className="text-xs text-muted-foreground">{fullDate(s.sentAt)} UTC</span>}
            </div>
            <p className="text-[13px] font-medium">{s.step === 1 ? subject : `Re: ${subject}`}</p>
            <p className="text-[13px] leading-relaxed whitespace-pre-line">{s.body}</p>
            {s.step > 1 && !s.personalized && s.status === "waiting" && (
              <p className="text-xs text-muted-foreground">
                Generic text for now. Claude writes the personal version just before it&apos;s due, if they haven&apos;t replied.
              </p>
            )}
          </section>
        ))}
        <p className="border-t border-rule px-5 py-4 text-xs text-muted-foreground">
          Every email ends with the sender&apos;s name, company and address from Settings. Emails 2 and 3 reply in the same thread.
        </p>
      </SheetContent>
    </Sheet>
  )
}
