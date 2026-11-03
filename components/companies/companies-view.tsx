"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Building2, DatabaseZap, Download, FileDown, Newspaper, FlaskConical, MapPin, RotateCcw, Search, UserSearch } from "lucide-react"
import { toast } from "sonner"
import { BackendError, WorkspaceGate } from "@/components/companies/backend-state"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EnrichDialog } from "@/components/enrich-dialog"
import { ReadPostsDialog } from "@/components/read-posts-dialog"
import { ApolloSearchDialog } from "@/components/companies/apollo-search-dialog"
import { GoogleMapsSearchDialog } from "@/components/companies/google-maps-search-dialog"
import { FindStakeholdersDialog } from "@/components/companies/find-stakeholders-dialog"
import { LeadIntelImportDialog } from "@/components/companies/lead-intel-import-dialog"
import { SourcePill, StatusPill } from "@/components/companies/pipeline-cells"
import { EmptyState } from "@/components/empty-state"
import { ManagerOnly } from "@/components/manager-only"
import { PageHeader } from "@/components/page-header"
import { Pager } from "@/components/pager"
import { TableSkeleton } from "@/components/table-skeleton"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  type PipelineCompany,
  type PipelineStatus,
  fetchIcps,
  fetchPipeline,
  fetchStakeholders,
  researchCompanies,
  decideCompanies,
  downloadCsv,
  useApi,
  type CompanySource,
} from "@/lib/api"
import { formatUsd } from "@/lib/format"
import { cn } from "@/lib/utils"

const MAX_RESEARCH = 10 // per request; bigger selections run in groups of 10
const MAX_REVERIFY = 200
const COST_PER_VERIFY = 0.004 // website (free), Instagram profile and Claude's score
const FILTERS: { value: "all" | PipelineStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "review", label: "To approve" },
  { value: "qualified", label: "Qualified" },
  { value: "found", label: "To research" },
  { value: "not_fit", label: "Not a fit" },
  { value: "error", label: "Couldn't finish" },
]

const needsResearch = (c: PipelineCompany) => c.source !== "lead_intel" && (c.status === "found" || c.status === "error")

/** The company pipeline, for every ICP or one: find, research and score, then find stakeholders at the qualified ones. */
export function CompaniesView({ initialIcp }: { initialIcp: string }) {
  return (
    <>
      <PageHeader
        title="Companies"
        description="Find companies for an ICP in Lead Intel and Apollo, research and score them, then find their people."
      />
      <div className="space-y-4 px-4 pb-10 md:px-8">
        <WorkspaceGate>{(wsId) => <Pipeline key={wsId} wsId={wsId} initialIcp={initialIcp} />}</WorkspaceGate>
      </div>
    </>
  )
}

function Pipeline({ wsId, initialIcp }: { wsId: string; initialIcp: string }) {
  const router = useRouter()
  const icps = useApi(() => fetchIcps(wsId), [wsId])
  const [icpId, setIcpId] = useState(initialIcp)
  // No ICP picked (or an unknown one) shows every company.
  const activeIcp = icps.data?.find((i) => i.id === icpId)
  const companies = useApi(() => fetchPipeline(wsId, activeIcp?.id), [wsId, activeIcp?.id])
  const people = useApi(() => fetchStakeholders(wsId), [wsId])
  const [filter, setFilter] = useState<"all" | PipelineStatus>("all")
  const [confirmReverify, setConfirmReverify] = useState<PipelineCompany[] | null>(null)
  const [fillingIn, setFillingIn] = useState<string[] | null>(null)
  const [readingPosts, setReadingPosts] = useState<string[] | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [finding, setFinding] = useState<CompanySource | null>(null)
  const [stakeholdersFor, setStakeholdersFor] = useState<PipelineCompany[] | null>(null)
  const [busy, setBusy] = useState("")

  const list = companies.data ?? []
  const icpName = new Map((icps.data ?? []).map((i) => [i.id, i.name]))
  const counts = Object.fromEntries(FILTERS.map((f) => [f.value, f.value === "all" ? list.length : list.filter((c) => c.status === f.value).length]))
  const peopleAt = new Map<string, number>()
  for (const p of people.data ?? []) if (p.pipelineCompanyId) peopleAt.set(p.pipelineCompanyId, (peopleAt.get(p.pipelineCompanyId) ?? 0) + 1)

  const q = query.trim().toLowerCase()
  const visible = list.filter(
    (c) => (filter === "all" || c.status === filter) && (!q || `${c.name} ${c.domain ?? ""}`.toLowerCase().includes(q)),
  )
  // One page of the filtered companies; a filter that shrinks the list past this page shows its last page.
  const pages = Math.max(1, Math.ceil(visible.length / pageSize))
  const current = Math.min(page, pages)
  const shown = visible.slice((current - 1) * pageSize, current * pageSize)
  const picked = list.filter((c) => selected.has(c.id))
  const toResearch = picked.filter(needsResearch)
  // Verified before (by Claude, or decided by hand): verify again with the current prompt.
  const toReverify = picked.filter((c) => c.source !== "lead_intel" && !needsResearch(c))
  // Approve and Reject act on any verified company, so a decision can also be changed.
  const toDecide = picked.filter((c) => c.status !== "found")
  const qualified = picked.filter((c) => c.status === "qualified")
  const allChecked = shown.length > 0 && shown.every((c) => selected.has(c.id))

  const changeIcp = (id: string) => {
    setIcpId(id)
    setSelected(new Set())
    setPage(1)
    router.replace(id === "all" ? "/companies" : `/companies?icp=${id}`, { scroll: false })
  }
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const research = async (targets: PipelineCompany[]) => {
    setBusy("research")
    const verb = targets.some((c) => c.researchedAt) ? "Verifying" : "Researching"
    const id = toast.loading(`${verb} ${targets.length} ${targets.length === 1 ? "company" : "companies"}… this can take a minute`)
    const total = { qualified: 0, toApprove: 0, errors: 0, costUsd: 0, notes: [] as string[] }
    try {
      // The server takes 10 at a time; a bigger selection runs as several, one after another.
      for (let i = 0; i < targets.length; i += MAX_RESEARCH) {
        if (targets.length > MAX_RESEARCH) toast.loading(`${verb}: ${i} of ${targets.length} done…`, { id })
        const r = await researchCompanies(wsId, targets.slice(i, i + MAX_RESEARCH).map((c) => c.id), true)
        total.qualified += r.qualified
        total.toApprove += r.toApprove
        total.errors += r.errors
        total.costUsd += r.costUsd
        total.notes.push(...r.notes)
      }
      const r = total
      toast.success(`${r.qualified} approved, ${r.toApprove} to approve${r.errors ? `, ${r.errors} couldn't finish` : ""}`, {
        id,
        description: [r.costUsd ? `Apify charged ${formatUsd(r.costUsd)}.` : "", ...new Set(r.notes)].filter(Boolean).join(" ") || undefined,
      })
      setSelected(new Set())
      companies.reload()
    } catch (e) {
      toast.error("Research failed", { id, description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy("")
    }
  }

  const decide = async (ids: string[], status: "qualified" | "not_fit") => {
    setBusy(status)
    try {
      const r = await decideCompanies(wsId, ids, status)
      toast.success(`${status === "qualified" ? "Approved" : "Rejected"} ${r.changed} ${r.changed === 1 ? "company" : "companies"}`)
      setSelected(new Set())
      companies.reload()
    } catch (e) {
      toast.error("Couldn't change them", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy("")
    }
  }

  if (icps.error && !icps.data) return <BackendError message={icps.error} onRetry={icps.reload} />
  if (!icps.data) return <TableSkeleton rows={6} />
  if (icps.data.length === 0)
    return <EmptyState icon={Building2} title="No ICPs yet" description="Add an ICP first; companies are found for an ICP." />
  // The ICP the dialogs start on: the one shown, else the first.
  const dialogIcp = activeIcp?.id ?? icps.data[0].id
  const afterAdding = (id: string) => (activeIcp && id !== activeIcp.id ? changeIcp(id) : companies.reload())

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={activeIcp?.id ?? "all"} onValueChange={changeIcp}>
          <SelectTrigger aria-label="ICP" className="w-60!">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ICPs</SelectItem>
            {icps.data.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search companies" placeholder="Search name or domain" className="pl-8" value={query} onChange={(e) => (setQuery(e.target.value), setPage(1))} />
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button
            variant="outline"
            title="Every company shown for this ICP (or all), with research, score and smart list"
            onClick={() =>
              void downloadCsv(wsId, activeIcp ? `/pipeline/companies.csv?icpId=${activeIcp.id}` : "/pipeline/companies.csv", "companies.csv").catch(
                (e) => toast.error(e.message),
              )
            }
          >
            <FileDown /> Export
          </Button>
          <ManagerOnly><Button variant="outline" onClick={() => setFinding("lead_intel")}>
            <Download /> Import from Lead Intel
          </Button></ManagerOnly>
          <ManagerOnly><Button variant="outline" onClick={() => setFinding("google_maps")}>
            <MapPin /> Search Google Maps
          </Button></ManagerOnly>
          <ManagerOnly><Button onClick={() => setFinding("apollo")}>
            <Search /> Search Apollo
          </Button></ManagerOnly>
        </div>
      </div>

      {counts.review > 0 && filter !== "review" && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <span>
            {counts.review} {counts.review === 1 ? "company waits" : "companies wait"} for you to approve or reject, under the threshold
            in Settings.
          </span>
          <Button size="sm" variant="outline" onClick={() => (setFilter("review"), setPage(1))}>
            Review them
          </Button>
        </div>
      )}

      <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={filter === f.value}
            onClick={() => (setFilter(f.value), setPage(1))}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              filter === f.value ? "border-data bg-data/10 font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {f.label} <span className="tabular-nums opacity-70">{counts[f.value]}</span>
          </button>
        ))}
      </div>

      {picked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm tabular-nums">{picked.length} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <ManagerOnly><Button
              size="sm"
              variant="outline"
              disabled={!toResearch.length || toResearch.length > MAX_RESEARCH || !!busy}
              title={toResearch.length > MAX_RESEARCH ? `Research up to ${MAX_RESEARCH} at a time` : undefined}
              onClick={() => void research(toResearch)}
            >
              <FlaskConical /> {busy === "research" ? "Researching…" : `Research ${toResearch.length}`}
            </Button></ManagerOnly>
            <ManagerOnly><Button
              size="sm"
              variant="outline"
              disabled={!toReverify.length || toReverify.length > MAX_REVERIFY || !!busy}
              title={toReverify.length > MAX_REVERIFY ? `Verify again up to ${MAX_REVERIFY} at a time` : undefined}
              onClick={() => setConfirmReverify(toReverify)}
            >
              <RotateCcw /> Verify {toReverify.length} again
            </Button></ManagerOnly>
            <ManagerOnly><Button
              size="sm"
              variant="outline"
              disabled={!toDecide.length || !!busy}
              onClick={() => void decide(toDecide.map((c) => c.id), "not_fit")}
            >
              {busy === "not_fit" ? "Rejecting…" : `Reject ${toDecide.length}`}
            </Button></ManagerOnly>
            <ManagerOnly><Button
              size="sm"
              variant="outline"
              disabled={!toDecide.length || !!busy}
              onClick={() => void decide(toDecide.map((c) => c.id), "qualified")}
            >
              {busy === "qualified" ? "Approving…" : `Approve ${toDecide.length}`}
            </Button></ManagerOnly>
            <ManagerOnly><Button size="sm" variant="outline" disabled={!!busy || picked.length > 2000} onClick={() => setReadingPosts(picked.map((c) => c.id))}>
              <Newspaper /> Read posts for {picked.length}
            </Button></ManagerOnly>
            <ManagerOnly><Button size="sm" variant="outline" disabled={!!busy} onClick={() => setFillingIn(picked.map((c) => c.id))}>
              <DatabaseZap /> Fill in {picked.length}
            </Button></ManagerOnly>
            <ManagerOnly><Button size="sm" disabled={!qualified.length || !!busy} onClick={() => setStakeholdersFor(qualified)}>
              <UserSearch /> Find stakeholders at {qualified.length}
            </Button></ManagerOnly>
          </div>
        </div>
      )}

      {companies.error && !companies.data ? (
        <BackendError message={companies.error} onRetry={companies.reload} />
      ) : companies.loading && !companies.data ? (
        <TableSkeleton rows={6} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={activeIcp ? `No companies for ${activeIcp.name} yet` : "No companies yet"}
          description="Import companies Lead Intel matched to an ICP (already verified), or search Google Maps or Apollo (researched and scored next)."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ManagerOnly><Button variant="outline" onClick={() => setFinding("lead_intel")}>
                <Download /> Import from Lead Intel
              </Button></ManagerOnly>
              <ManagerOnly><Button variant="outline" onClick={() => setFinding("google_maps")}>
                <MapPin /> Search Google Maps
              </Button></ManagerOnly>
              <ManagerOnly><Button onClick={() => setFinding("apollo")}>
                <Search /> Search Apollo
              </Button></ManagerOnly>
            </div>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={Search} title="No companies match" description="Try another status or search." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select this page"
                    checked={allChecked}
                    onCheckedChange={(v) =>
                      setSelected((set) => {
                        const next = new Set(set)
                        shown.forEach((c) => (v === true ? next.add(c.id) : next.delete(c.id)))
                        return next
                      })
                    }
                  />
                </TableHead>
                <TableHead>Company</TableHead>
                {!activeIcp && <TableHead>ICP</TableHead>}
                <TableHead>From</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">People</TableHead>
                <TableHead className="w-28">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/companies/${c.id}`)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox aria-label={`Select ${c.name}`} checked={selected.has(c.id)} onCheckedChange={(v) => toggle(c.id, v === true)} />
                  </TableCell>
                  <TableCell className="max-w-64">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="truncate text-[13px] text-muted-foreground">{c.domain ?? "No website"}</p>
                  </TableCell>
                  {!activeIcp && (
                    <TableCell className="max-w-40 truncate text-[13px]">{(c.icpId && icpName.get(c.icpId)) || "—"}</TableCell>
                  )}
                  <TableCell>
                    <SourcePill source={c.source} />
                  </TableCell>
                  <TableCell className="max-w-80">
                    <StatusPill status={c.status} />
                    {c.statusReason && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{c.statusReason}</p>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.score ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {peopleAt.get(c.id) ? (
                      <Link
                        href={`/companies/${c.id}?tab=people`}
                        className="text-data hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {peopleAt.get(c.id)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {c.status === "qualified" ? (
                      <Button size="sm" variant="outline" onClick={() => setStakeholdersFor([c])}>
                        <UserSearch /> People
                      </Button>
                    ) : needsResearch(c) ? (
                      <ManagerOnly><Button size="sm" variant="outline" disabled={!!busy} onClick={() => void research([c])}>
                        <FlaskConical /> Research
                      </Button></ManagerOnly>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t px-3 py-2">
            <Pager
              page={current}
              pageSize={pageSize}
              total={visible.length}
              onPage={setPage}
              onPageSize={(n) => (setPageSize(n), setPage(1))}
            />
          </div>
        </div>
      )}

      {finding === "lead_intel" && (
        <LeadIntelImportDialog
          workspaceId={wsId}
          icps={icps.data}
          initialIcpId={dialogIcp}
          onClose={() => setFinding(null)}
          onImported={afterAdding}
        />
      )}
      {finding === "apollo" && (
        <ApolloSearchDialog
          workspaceId={wsId}
          icps={icps.data}
          initialIcpId={dialogIcp}
          onClose={() => setFinding(null)}
          onFound={afterAdding}
        />
      )}
      {finding === "google_maps" && (
        <GoogleMapsSearchDialog
          workspaceId={wsId}
          icps={icps.data}
          initialIcpId={dialogIcp}
          onClose={() => setFinding(null)}
          onFound={afterAdding}
        />
      )}
      {stakeholdersFor && (
        <FindStakeholdersDialog
          workspaceId={wsId}
          companies={stakeholdersFor}
          onClose={() => setStakeholdersFor(null)}
          onDone={() => {
            setSelected(new Set())
            people.reload()
          }}
        />
      )}
      {readingPosts && (
        <ReadPostsDialog
          wsId={wsId}
          companyIds={readingPosts}
          onClose={() => setReadingPosts(null)}
          onDone={() => {
            setSelected(new Set())
            companies.reload()
          }}
        />
      )}
      {fillingIn && (
        <EnrichDialog
          wsId={wsId}
          companyIds={fillingIn}
          onClose={() => setFillingIn(null)}
          onDone={() => {
            setSelected(new Set())
            companies.reload()
          }}
        />
      )}
      <ConfirmDialog
          open={!!confirmReverify}
          onOpenChange={(o) => !o && setConfirmReverify(null)}
          title={`Verify ${confirmReverify?.length ?? 0} ${confirmReverify?.length === 1 ? "company" : "companies"} again?`}
          description={`Reads the website again and scores with the current verification prompt. The new verdict replaces the old one, including one you set by hand. About ${formatUsd((confirmReverify?.length ?? 0) * COST_PER_VERIFY)}, logged on Usage.`}
          confirmLabel="Verify again"
          onConfirm={() => {
            const targets = confirmReverify ?? []
            setConfirmReverify(null)
            void research(targets)
          }}
        />
    </>
  )
}
