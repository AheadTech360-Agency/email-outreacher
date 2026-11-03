"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowRight, CheckCircle2, Rocket } from "lucide-react"
import { toast } from "sonner"
import { BackendError, WorkspaceGate } from "@/components/companies/backend-state"
import { ManagerOnly } from "@/components/manager-only"
import { PageHeader } from "@/components/page-header"
import { IcpDraftPanel } from "@/components/smart-lists/icp-draft-panel"
import { TableSkeleton } from "@/components/table-skeleton"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { type HomeData, type HomeStage, type SmartList, fetchHome, fetchSmartLists, setSmartListIcp, useApi } from "@/lib/api"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

// Where each person sits, in the order they move through. The colour runs from grey (can't be written to yet)
// through the data hue (being worked) to green (out the door), on the strip, its legend and every ICP's bar.
const STAGES: { key: HomeStage; label: string; hint: string; href: string; tone: string }[] = [
  { key: "no_email", label: "No email yet", hint: "Reveal their emails", href: "/people", tone: "bg-input" },
  { key: "ready", label: "Ready to write", hint: "Write their emails", href: "/quickstart", tone: "bg-data-mid" },
  { key: "review", label: "To review", hint: "Approve or edit", href: "/review", tone: "bg-data" },
  { key: "approved", label: "Approved", hint: "Queue them", href: "/review", tone: "bg-data" },
  { key: "queued", label: "Queued", hint: "Sending soon", href: "/outbox", tone: "bg-positive/60" },
  { key: "sent", label: "Sent", hint: "Waiting on a reply", href: "/outbox", tone: "bg-positive" },
  { key: "replied", label: "Replied", hint: "Answer them", href: "/replies", tone: "bg-positive" },
]

const fmt = (n: number) => n.toLocaleString()
const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`
const errorText = (e: unknown) => (e instanceof Error ? e.message : undefined)

export default function HomePage() {
  return <WorkspaceGate>{(wsId) => <Home key={wsId} wsId={wsId} />}</WorkspaceGate>
}

function Home({ wsId }: { wsId: string }) {
  const home = useApi(() => fetchHome(wsId), [wsId])
  const lists = useApi(() => fetchSmartLists(wsId, "company"), [wsId])
  const { reloadIcps } = useStore()
  const reload = () => {
    home.reload()
    lists.reload()
    reloadIcps()
  }
  const d = home.data
  const drafts = (lists.data?.lists ?? []).filter((l) => l.icpDraft && !l.leadIntelIcpId)

  return (
    <>
      <PageHeader
        title="Home"
        description={d ? finding(d) : "Counting where everyone is…"}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/companies">Find companies</Link>
            </Button>
            <Button asChild>
              <Link href="/quickstart">
                <Rocket /> Write emails
              </Link>
            </Button>
          </>
        }
      >
        {d && <Pipeline data={d} />}
      </PageHeader>
      <div className="space-y-10 px-4 pb-12 md:px-8">
        {home.error && !d ? (
          <BackendError message={home.error} onRetry={home.reload} />
        ) : !d ? (
          <TableSkeleton rows={6} />
        ) : (
          <>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <NextSteps data={d} drafts={drafts.length} />
              <Drafts wsId={wsId} drafts={drafts} loading={!lists.data} onChanged={reload} />
            </div>
            <NoIcp wsId={wsId} data={d} onChanged={reload} />
            <ByIcp data={d} />
          </>
        )}
      </div>
    </>
  )
}

/** The one thing in the numbers that most needs attention, as the line under the title. */
function finding(d: HomeData): string {
  const ready = d.stages.ready ?? 0
  const t = d.todo
  if (t.replies) return `${plural(t.replies, "person has", "people have")} replied. Answer them first.`
  if (t.draftsToReview) return `${plural(t.draftsToReview, "email is", "emails are")} waiting for your review.`
  if (ready && t.companiesNoIcp)
    return `${fmt(ready)} people are ready for an email, and ${plural(t.companiesNoIcp, "company", "companies")} still need an ICP before they can get one.`
  if (ready) return `${fmt(ready)} people are ready for an email. Write them from Quick Start.`
  return "Everyone found so far has been written to. Find more companies to keep going."
}

function Pipeline({ data }: { data: HomeData }) {
  const total = STAGES.reduce((sum, s) => sum + (data.stages[s.key] ?? 0), 0)
  return (
    <section aria-labelledby="pipeline-title" className="rounded-lg border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pipeline-title" className="text-sm font-semibold">
          Where your {fmt(total)} people are
        </h2>
        <p className="text-xs text-muted-foreground">Each person counted once, at the furthest step their first email reached.</p>
      </div>
      <Bar counts={data.stages} className="mt-4 h-3" label={`${fmt(total)} people by stage`} />
      <ol className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
        {STAGES.map((s) => {
          const n = data.stages[s.key] ?? 0
          return (
            <li key={s.key}>
              <Link href={s.href} className="group block rounded-md outline-offset-4">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn("size-2 flex-none rounded-[2px]", s.tone)} aria-hidden />
                  {s.label}
                </span>
                <span className={cn("mt-1 block text-2xl leading-8 font-semibold tabular-nums", !n && "text-muted-foreground")}>{fmt(n)}</span>
                <span className="block text-xs text-muted-foreground group-hover:text-foreground group-hover:underline">
                  {n ? s.hint : "None yet"}
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** People by stage as one proportional strip. A stage with anyone in it stays visible however small. */
function Bar({ counts, className, label }: { counts: Partial<Record<HomeStage, number>>; className?: string; label: string }) {
  const total = STAGES.reduce((sum, s) => sum + (counts[s.key] ?? 0), 0)
  return (
    <div role="img" aria-label={label} className={cn("flex w-full gap-0.5 overflow-hidden rounded-[3px] bg-muted", className)}>
      {total > 0 &&
        STAGES.map((s) => {
          const n = counts[s.key] ?? 0
          return n ? <span key={s.key} className={s.tone} style={{ flexGrow: n, minWidth: 4 }} title={`${s.label}: ${fmt(n)}`} /> : null
        })}
    </div>
  )
}

function NextSteps({ data, drafts }: { data: HomeData; drafts: number }) {
  const t = data.todo
  const ready = data.stages.ready ?? 0
  // Closest to a sent email first. "blocked" marks what stops emails being written at all.
  const items = [
    { n: t.replies, what: plural(t.replies, "reply", "replies"), why: "People answered in the last 14 days", href: "/replies", action: "Read" },
    { n: t.draftsToReview, what: plural(t.draftsToReview, "email to review", "emails to review"), why: "Nothing is sent until you approve it", href: "/review", action: "Review" },
    { n: t.approvedNotQueued, what: plural(t.approvedNotQueued, "approved email", "approved emails"), why: "Approved but not queued for sending yet", href: "/review", action: "Queue" },
    { n: t.runsWaiting, what: plural(t.runsWaiting, "Quick Start run", "Quick Start runs"), why: "Paused until you decide on some companies", href: "/quickstart", action: "Continue" },
    { n: ready, what: plural(ready, "person ready to write", "people ready to write"), why: "They have an email and no draft yet", href: "/quickstart", action: "Write" },
    { n: t.companiesNoIcp, what: plural(t.companiesNoIcp, "company without an ICP", "companies without an ICP"), why: "No email can be written for them until they have one", href: "#no-icp", action: "Assign", blocked: true },
    { n: drafts, what: plural(drafts, "draft ICP", "draft ICPs"), why: "Claude drafted them from your smart lists", href: "#drafts", action: "Create", blocked: true },
    { n: t.companiesToApprove, what: plural(t.companiesToApprove, "company to approve", "companies to approve"), why: "Scored under your threshold, so they wait for you", href: "/companies", action: "Decide" },
    { n: t.companiesNoPeople, what: plural(t.companiesNoPeople, "approved company", "approved companies"), why: "No one found there yet", href: "/companies", action: "Find people" },
    { n: t.peopleNoEmail, what: plural(t.peopleNoEmail, "person without an email", "people without an email"), why: "Reveal them with Apollo to write to them", href: "/people", action: "Reveal" },
    { n: t.companiesToVerify, what: plural(t.companiesToVerify, "company to verify", "companies to verify"), why: "Found on Google Maps, not checked yet", href: "/companies", action: "Verify" },
  ].filter((i) => i.n > 0)  // prettier-ignore
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, 6)

  return (
    <section aria-labelledby="next-title" className="min-w-0 space-y-3">
      <h2 id="next-title" className="text-base font-semibold">
        Next steps
      </h2>
      <div className="overflow-hidden rounded-lg border">
        {items.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-4 text-sm">
            <CheckCircle2 className="size-4 text-positive" aria-hidden /> Nothing is waiting on you.
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {shown.map((i, idx) => (
              <li key={i.what} className="flex items-center gap-4 px-4 py-3">
                <span className={cn("w-1 self-stretch rounded-full", i.blocked ? "bg-warning" : idx === 0 ? "bg-data" : "bg-transparent")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{i.what}</span>
                  <span className="block text-xs text-muted-foreground">{i.why}</span>
                </span>
                <Button asChild size="sm" variant={idx === 0 ? "default" : "outline"}>
                  <Link href={i.href}>
                    {i.action} <ArrowRight />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
        {items.length > 6 && (
          <button type="button" onClick={() => setAll(!all)} className="w-full border-t px-4 py-2 text-left text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground">
            {all ? "Show fewer" : `Show ${items.length - 6} more`}
          </button>
        )}
      </div>
    </section>
  )
}

function Drafts({ wsId, drafts, loading, onChanged }: { wsId: string; drafts: SmartList[]; loading: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState<SmartList | null>(null)
  return (
    <section id="drafts" aria-labelledby="drafts-title" className="min-w-0 scroll-mt-6 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="drafts-title" className="text-base font-semibold">
          Draft ICPs to create
        </h2>
        <Link href="/smart-lists" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
          Smart lists
        </Link>
      </div>
      <div className="overflow-hidden rounded-lg border">
        {loading ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Loading drafts…</p>
        ) : drafts.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">No drafts waiting. Claude drafts one when it sorts companies no ICP fits.</p>
        ) : (
          <ul className="divide-y divide-rule">
            {drafts.slice(0, 4).map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => setOpen(l)} className="group block w-full px-4 py-3 text-left hover:bg-muted/50">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium">{l.icpDraft?.name || l.name}</span>
                    <span className="flex-none text-xs text-muted-foreground tabular-nums">{plural(l.count, "company", "companies")}</span>
                  </span>
                  {l.icpDraft?.description && <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{l.icpDraft.description}</span>}
                  <span className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary">
                    Review and create <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {drafts.length > 4 && (
          <Link href="/smart-lists" className="block border-t px-4 py-2 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground">
            {drafts.length - 4} more on Smart lists
          </Link>
        )}
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl!">
          <DialogHeader>
            <DialogTitle>{open?.icpDraft?.name || open?.name}</DialogTitle>
            <DialogDescription>
              Drafted from the {open ? plural(open.count, "company", "companies") : ""} in the smart list {open?.name}. Edit anything, then create it:
              the list&apos;s companies without an ICP go under it.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <IcpDraftPanel
              wsId={wsId}
              list={open}
              onChanged={() => {
                setOpen(null)
                onChanged()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

function NoIcp({ wsId, data, onChanged }: { wsId: string; data: HomeData; onChanged: () => void }) {
  const [all, setAll] = useState(false)
  if (!data.noIcp.length) return null
  const total = data.noIcp.reduce((sum, r) => sum + r.count, 0)
  const largest = Math.max(...data.noIcp.map((r) => r.count))
  const shown = all ? data.noIcp : data.noIcp.slice(0, 6)
  return (
    <section id="no-icp" aria-labelledby="no-icp-title" className="scroll-mt-6 space-y-3">
      <div>
        <h2 id="no-icp-title" className="text-base font-semibold">
          {plural(total, "company", "companies")} without an ICP
        </h2>
        <p className="text-sm text-muted-foreground">Give a smart list an ICP and its companies go under it, with their people. Companies that have one keep it.</p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 font-medium">Smart list</th>
              <th className="w-[30%] px-3 py-2 font-medium">Companies</th>
              <th className="px-4 py-2 text-right font-medium">Put them under</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {shown.map((row) => (
              <NoIcpRow key={row.listId ?? "none"} wsId={wsId} row={row} largest={largest} onChanged={onChanged} />
            ))}
          </tbody>
        </table>
        {data.noIcp.length > 6 && (
          <button type="button" onClick={() => setAll(!all)} className="w-full border-t px-4 py-2 text-left text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground">
            {all ? "Show fewer" : `Show ${data.noIcp.length - 6} more lists`}
          </button>
        )}
      </div>
    </section>
  )
}

function NoIcpRow({ wsId, row, largest, onChanged }: { wsId: string; row: HomeData["noIcp"][number]; largest: number; onChanged: () => void }) {
  const { icps } = useStore()
  const [icpId, setIcpId] = useState("")
  const [saving, setSaving] = useState(false)
  const assign = async () => {
    if (!row.listId || !icpId) return
    setSaving(true)
    try {
      await setSmartListIcp(wsId, row.listId, icpId)
      toast.success(`${row.name} is under ${icps.find((i) => i.id === icpId)?.name ?? "that ICP"} now`)
      onChanged()
    } catch (e) {
      toast.error("Couldn't assign it", { description: errorText(e) })
      setSaving(false)
    }
  }
  return (
    <tr>
      <td className="px-4 py-2.5">
        <span className="font-medium">{row.name ?? "Not in a smart list"}</span>
        {row.hasDraft && <span className="block text-xs text-muted-foreground">Has a draft ICP</span>}
      </td>
      <td className="px-3 py-2.5">
        <span className="flex items-center gap-2">
          <span className="w-10 text-right tabular-nums">{fmt(row.count)}</span>
          <span className="h-1.5 flex-1 rounded-full bg-muted" aria-hidden>
            <span className="block h-full rounded-full bg-warning/70" style={{ width: `${Math.max(2, (row.count / largest) * 100)}%` }} />
          </span>
        </span>
      </td>
      <td className="px-4 py-2.5">
        {row.listId ? (
          <ManagerOnly>
            <div className="flex items-center justify-end gap-2">
              <Select value={icpId} onValueChange={setIcpId}>
                <SelectTrigger size="sm" className="w-52!" aria-label={`ICP for ${row.name}`}>
                  <SelectValue placeholder="Pick an ICP" />
                </SelectTrigger>
                <SelectContent>
                  {icps.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!icpId || saving} onClick={() => void assign()}>
                {saving ? "Assigning…" : "Assign"}
              </Button>
            </div>
          </ManagerOnly>
        ) : (
          <div className="flex justify-end">
            <Button asChild size="sm" variant="outline">
              <Link href="/smart-lists">Sort them first</Link>
            </Button>
          </div>
        )}
      </td>
    </tr>
  )
}

function ByIcp({ data }: { data: HomeData }) {
  const { icps } = useStore()
  const name = (id: string | null) => (id ? (icps.find((i) => i.id === id)?.name ?? "Deleted ICP") : "No ICP")
  const n = (counts: Record<string, number | undefined>, ...keys: string[]) => keys.reduce((sum, k) => sum + (counts[k] ?? 0), 0)
  return (
    <section aria-labelledby="by-icp-title" className="space-y-3">
      <h2 id="by-icp-title" className="text-base font-semibold">
        By ICP
      </h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 font-medium">ICP</th>
              <th className="px-3 py-2 text-right font-medium">Companies</th>
              <th className="px-3 py-2 text-right font-medium">Approved</th>
              <th className="px-3 py-2 text-right font-medium">People</th>
              <th className="w-[34%] px-4 py-2 font-medium">Where they are</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {data.icps.map((row) => {
              const people = n(row.people, ...STAGES.map((s) => s.key))
              return (
                <tr key={row.icpId ?? "none"}>
                  <td className="px-4 py-2.5">
                    {row.icpId ? (
                      <Link href={`/icps/${row.icpId}`} className="font-medium hover:underline">
                        {name(row.icpId)}
                      </Link>
                    ) : (
                      <a href="#no-icp" className="font-medium text-warning hover:underline">
                        No ICP yet
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(n(row.companies, "found", "review", "qualified", "not_fit", "error"))}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(n(row.companies, "qualified"))}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(people)}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-3">
                      <Bar counts={row.people} className="h-2 flex-1" label={`${name(row.icpId)}: ${fmt(people)} people by stage`} />
                      <span className="w-28 flex-none text-xs text-muted-foreground tabular-nums">
                        {fmt(row.people.ready ?? 0)} ready · {fmt(n(row.people, "queued", "sent", "replied"))} sent
                      </span>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
