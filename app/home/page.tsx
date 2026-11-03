"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowRight, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { BackendError, WorkspaceGate } from "@/components/companies/backend-state"
import { ManagerOnly } from "@/components/manager-only"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { type HomeData, type HomeStage, fetchHome, setSmartListIcp, useApi } from "@/lib/api"
import { useStore } from "@/lib/store"

// Where each person sits, in the order they move through.
const STAGES: { key: HomeStage; label: string; href: string }[] = [
  { key: "no_email", label: "No email yet", href: "/people" },
  { key: "ready", label: "Ready to write", href: "/people" },
  { key: "review", label: "Email to review", href: "/review" },
  { key: "approved", label: "Approved", href: "/review" },
  { key: "queued", label: "Queued to send", href: "/outbox" },
  { key: "sent", label: "Sent", href: "/outbox" },
  { key: "replied", label: "Replied", href: "/replies" },
]

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`

export default function HomePage() {
  return (
    <>
      <PageHeader title="Home" description="What's left to do, and where everyone is." />
      <div className="space-y-8 px-4 pb-10 md:px-8">
        <WorkspaceGate>{(wsId) => <Home key={wsId} wsId={wsId} />}</WorkspaceGate>
      </div>
    </>
  )
}

function Home({ wsId }: { wsId: string }) {
  const home = useApi(() => fetchHome(wsId), [wsId])
  if (home.error && !home.data) return <BackendError message={home.error} onRetry={home.reload} />
  if (!home.data) return <TableSkeleton rows={6} />
  return (
    <>
      <Todo data={home.data} />
      <NoIcp wsId={wsId} data={home.data} onChanged={home.reload} />
      <Stages data={home.data} />
      <ByIcp data={home.data} />
    </>
  )
}

function Todo({ data }: { data: HomeData }) {
  const t = data.todo
  // The order to deal with them: what's closest to a sent email first.
  const items = [
    { n: t.replies, text: plural(t.replies, "person replied", "people replied") + " in the last 14 days", href: "/replies", action: "Read replies" },
    { n: t.draftsToReview, text: plural(t.draftsToReview, "email is", "emails are") + " waiting for your review", href: "/review", action: "Review" },
    { n: t.approvedNotQueued, text: plural(t.approvedNotQueued, "approved email isn't", "approved emails aren't") + " queued yet", href: "/review", action: "Queue" },
    { n: t.runsWaiting, text: plural(t.runsWaiting, "Quick Start run is", "Quick Start runs are") + " waiting for you", href: "/quickstart", action: "Open" },
    { n: t.companiesToApprove, text: plural(t.companiesToApprove, "company needs", "companies need") + " approving or rejecting", href: "/companies", action: "Decide" },
    { n: t.companiesNoIcp, text: plural(t.companiesNoIcp, "company has", "companies have") + " no ICP, so no emails can be written for them", href: "#no-icp", action: "Assign" },
    { n: t.draftIcps, text: plural(t.draftIcps, "draft ICP is", "draft ICPs are") + " waiting to be created", href: "/smart-lists", action: "Smart lists" },
    { n: t.companiesNoPeople, text: plural(t.companiesNoPeople, "approved company has", "approved companies have") + " no one found yet", href: "/companies", action: "Find people" },
    { n: t.peopleNoEmail, text: plural(t.peopleNoEmail, "person has", "people have") + " no email yet", href: "/people", action: "Reveal" },
    { n: t.companiesToVerify, text: plural(t.companiesToVerify, "company isn't", "companies aren't") + " verified yet", href: "/companies", action: "Verify" },
  ].filter((i) => i.n > 0)  // prettier-ignore

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">To do</h2>
      <div className="divide-y divide-rule rounded-lg border">
        {items.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-positive" /> Nothing waiting. Start a run on Quick Start to find more people.
          </p>
        ) : (
          items.map((i) => (
            <div key={i.text} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 text-sm">{i.text}</span>
              <Button asChild size="sm" variant="outline">
                <Link href={i.href}>
                  {i.action} <ArrowRight />
                </Link>
              </Button>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function NoIcp({ wsId, data, onChanged }: { wsId: string; data: HomeData; onChanged: () => void }) {
  if (!data.noIcp.length) return null
  return (
    <section id="no-icp" className="space-y-3 scroll-mt-6">
      <div>
        <h2 className="text-base font-semibold">Companies without an ICP</h2>
        <p className="text-sm text-muted-foreground">
          Give each smart list an ICP and its companies, with their people, go under it. Companies that already have one keep it.
        </p>
      </div>
      <div className="divide-y divide-rule rounded-lg border">
        {data.noIcp.map((row) => (
          <NoIcpRow key={row.listId ?? "none"} wsId={wsId} row={row} onChanged={onChanged} />
        ))}
      </div>
    </section>
  )
}

function NoIcpRow({ wsId, row, onChanged }: { wsId: string; row: HomeData["noIcp"][number]; onChanged: () => void }) {
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
      toast.error("Couldn't assign it", { description: e instanceof Error ? e.message : undefined })
      setSaving(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
      <span className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{row.name ?? "Not in a smart list"}</span>
        <span className="text-muted-foreground"> · {plural(row.count, "company", "companies")}</span>
      </span>
      {row.listId ? (
        <ManagerOnly>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={icpId} onValueChange={setIcpId}>
              <SelectTrigger size="sm" className="w-56!" aria-label={`ICP for ${row.name}`}>
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
            {row.hasDraft && (
              <Button asChild size="sm" variant="ghost">
                <Link href="/smart-lists">Or create its draft ICP</Link>
              </Button>
            )}
          </div>
        </ManagerOnly>
      ) : (
        <Button asChild size="sm" variant="outline">
          <Link href="/smart-lists">
            Sort them <ArrowRight />
          </Link>
        </Button>
      )}
    </div>
  )
}

function Stages({ data }: { data: HomeData }) {
  const total = STAGES.reduce((sum, s) => sum + (data.stages[s.key] ?? 0), 0)
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Where everyone is</h2>
        <p className="text-sm text-muted-foreground">{plural(total, "person", "people")}, each counted once at the furthest step they reached.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {STAGES.map((s) => (
          <Link key={s.key} href={s.href} className="rounded-lg border px-3 py-2.5 hover:bg-muted/50">
            <span className="block text-xs text-muted-foreground">{s.label}</span>
            <span className="block text-xl font-semibold tabular-nums">{(data.stages[s.key] ?? 0).toLocaleString()}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

function ByIcp({ data }: { data: HomeData }) {
  const { icps } = useStore()
  const name = (id: string | null) => (id ? (icps.find((i) => i.id === id)?.name ?? "Deleted ICP") : "No ICP")
  const n = (counts: Record<string, number | undefined>, ...keys: string[]) => keys.reduce((sum, k) => sum + (counts[k] ?? 0), 0)
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">By ICP</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2 font-medium">ICP</th>
              <th className="px-3 py-2 text-right font-medium">Companies</th>
              <th className="px-3 py-2 text-right font-medium">Approved</th>
              <th className="px-3 py-2 text-right font-medium">To verify</th>
              <th className="px-3 py-2 text-right font-medium">People</th>
              <th className="px-3 py-2 text-right font-medium">Ready to write</th>
              <th className="px-3 py-2 text-right font-medium">In review</th>
              <th className="px-4 py-2 text-right font-medium">Sent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {data.icps.map((row) => (
              <tr key={row.icpId ?? "none"}>
                <td className="px-4 py-2">
                  {row.icpId ? (
                    <Link href={`/icps/${row.icpId}`} className="font-medium hover:underline">
                      {name(row.icpId)}
                    </Link>
                  ) : (
                    <a href="#no-icp" className="font-medium text-muted-foreground hover:underline">
                      No ICP
                    </a>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{n(row.companies, "found", "review", "qualified", "not_fit", "error").toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(row.companies, "qualified").toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(row.companies, "found", "review").toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(row.people, ...STAGES.map((s) => s.key)).toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(row.people, "ready").toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n(row.people, "review", "approved").toLocaleString()}</td>
                <td className="px-4 py-2 text-right tabular-nums">{n(row.people, "queued", "sent", "replied").toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
