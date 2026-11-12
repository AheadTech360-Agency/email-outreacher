"use client"

import { FacetFilters } from "@/components/facet-filters"
import { choices, pickFacets, PRESENCE_OPTIONS, SCORE_OPTIONS } from "@/lib/facets"
import { type CompanyBrief, type CompanyFilters, type CompanyRow, fetchCompaniesPage, fetchMatchingCompanies } from "@/lib/lists"
import { pickRows, useDebounced } from "@/lib/use-debounced"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { Building2, Check, ChevronDown, DatabaseZap, Download, FileDown, FlaskConical, MapPin, Newspaper, RotateCcw, Search, UserSearch, X } from "lucide-react"
import { toast } from "sonner"
import { BackendError, WorkspaceGate } from "@/components/companies/backend-state"
import { ArchiveFilter, ArchiveRecordsButton } from "@/components/archive-records"
import { ListTools, BulkSelection } from "@/components/list-tools"
import { DeleteRecordsButton } from "@/components/delete-records-button"
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  type PipelineStatus,
  fetchIcps,
  researchCompanies,
  decideCompanies,
  downloadCsv,
  useApi,
  type CompanySource,
} from "@/lib/api"
import { formatUsd } from "@/lib/format"
import { useAuth } from "@/lib/auth"
import { canManage } from "@/lib/roles"
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

const needsResearch = (c: CompanyBrief) => c.source !== "lead_intel" && (c.status === "found" || c.status === "error")

/** The company pipeline, for every ICP or one: find, research and score, then find stakeholders at the qualified ones. */
export function CompaniesView({ initialIcp }: { initialIcp: string }) {
  return (
    <>
      <PageHeader
        title="Companies"
        description="The businesses you could email. Find them, approve the good ones, then find the people there."
      />
      <div className="space-y-4 px-4 pb-10 md:px-8">
        <WorkspaceGate>{(wsId) => <Pipeline key={wsId} wsId={wsId} initialIcp={initialIcp} />}</WorkspaceGate>
      </div>
    </>
  )
}

function Pipeline({ wsId, initialIcp }: { wsId: string; initialIcp: string }) {
  const router = useRouter()
  const { me } = useAuth()
  const icps = useApi(() => fetchIcps(wsId), [wsId])
  const [icpId, setIcpId] = useState(initialIcp)
  // No ICP picked (or an unknown one) shows every company.
  const activeIcp = icps.data?.find((i) => i.id === icpId)
  const [filter, setFilter] = useState<"all" | PipelineStatus>("all")
  const [confirmReverify, setConfirmReverify] = useState<CompanyBrief[] | null>(null)
  const [fillingIn, setFillingIn] = useState<string[] | null>(null)
  const [readingPosts, setReadingPosts] = useState<string[] | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [query, setQuery] = useState("")
  const [extra, setExtra] = useState<Record<string, string>>({})
  // Picked companies, with the fields their bulk actions read: kept across pages.
  const [selected, setSelected] = useState<Map<string, CompanyBrief>>(new Map())
  const [finding, setFinding] = useState<CompanySource | null>(null)
  const [stakeholdersFor, setStakeholdersFor] = useState<CompanyBrief[] | null>(null)
  const [busy, setBusy] = useState("")

  const [archiveFilter, setArchiveFilter] = useState("active")
  // The server filters, counts and pages; typing waits for a pause before it asks.
  const typedQuery = useDebounced(query)
  const typedLocation = useDebounced(extra.location ?? "")
  const filters: CompanyFilters = useMemo(() => ({
    icpId: activeIcp?.id, archive: archiveFilter, status: filter, q: typedQuery, source: extra.source, location: typedLocation,
    website: extra.website, contacts: extra.contacts, scoreBand: extra.scoreBand, icpState: extra.icpState,
  }), [activeIcp?.id, archiveFilter, filter, typedQuery, extra.source, typedLocation, extra.website, extra.contacts, extra.scoreBand, extra.icpState])  // prettier-ignore
  const companies = useApi(() => fetchCompaniesPage(wsId, filters, page, pageSize), [wsId, filters, page, pageSize])
  // Every match, only while something is picked (for "Select all N matching" and what's outside these filters).
  const matching = useApi(() => (selected.size ? fetchMatchingCompanies(wsId, filters) : Promise.resolve(null)), [wsId, filters, selected.size > 0])
  const icpName = new Map((icps.data ?? []).map((i) => [i.id, i.name]))
  const counts = companies.data?.counts ?? {}
  const total = companies.data?.total ?? 0
  const shown: CompanyRow[] = companies.data?.items ?? []
  const current = page
  // A page past the end (rows left the filter, or were deleted) moves back to the last page.
  if (companies.data && !companies.data.items.length && total > 0 && page > 1) setPage(Math.max(1, Math.ceil(total / pageSize)))
  const picked = [...selected.values()]
  const toResearch = picked.filter(needsResearch)
  // Verified before (by Claude, or decided by hand): verify again with the current prompt.
  const toReverify = picked.filter((c) => c.source !== "lead_intel" && !needsResearch(c))
  // Approve and Reject act on any verified company, so a decision can also be changed.
  const toDecide = picked.filter((c) => c.status !== "found")
  const qualified = picked.filter((c) => c.status === "qualified")
  const allChecked = shown.length > 0 && shown.every((c) => selected.has(c.id))
  const brief = (c: CompanyRow): CompanyBrief => ({ id: c.id, status: c.status, source: c.source, researchedAt: c.researchedAt, name: c.name, domain: c.domain })

  const changeIcp = (id: string) => {
    setIcpId(id)
    setSelected(new Map())
    setPage(1)
    router.replace(id === "all" ? "/companies" : `/companies?icp=${id}`, { scroll: false })
  }
  const actions = [
    { key: "find", label: `Find people at ${qualified.length}`, doing: "Finding…", busy: "find", icon: UserSearch,
      run: () => setStakeholdersFor(qualified), disabled: !qualified.length },
    { key: "approve", label: `Approve ${toDecide.length}`, doing: "Approving…", busy: "qualified", icon: Check,
      run: () => void decide(toDecide.map((c) => c.id), "qualified"), disabled: !toDecide.length },
    { key: "verify", label: `Verify ${toResearch.length}`, doing: "Verifying…", busy: "research", icon: FlaskConical,
      run: () => void research(toResearch), disabled: !toResearch.length },
    { key: "posts", label: `Read posts for ${picked.length}`, doing: "", busy: "", icon: Newspaper,
      run: () => setReadingPosts(picked.map((c) => c.id)), disabled: picked.length > 2000 },
    { key: "fill", label: `Fill in ${picked.length}`, doing: "", busy: "", icon: DatabaseZap,
      run: () => setFillingIn(picked.map((c) => c.id)), disabled: false },
    { key: "reverify", label: `Verify ${toReverify.length} again`, doing: "", busy: "", icon: RotateCcw,
      run: () => setConfirmReverify(toReverify), disabled: !toReverify.length || toReverify.length > MAX_REVERIFY },
    { key: "reject", label: `Reject ${toDecide.length}`, doing: "Rejecting…", busy: "not_fit", icon: X,
      run: () => void decide(toDecide.map((c) => c.id), "not_fit"), disabled: !toDecide.length },
  ]  // prettier-ignore
  // The next step: find people at approved companies, else approve the ones waiting, else verify new ones.
  const waiting = picked.some((c) => c.status === "review")
  const nextKey = qualified.length ? "find" : waiting ? "approve" : toResearch.length ? "verify" : null
  const next = actions.find((a) => a.key === nextKey)
  const more = actions.filter((a) => a.key !== nextKey)

  const toggle = (c: CompanyRow, on: boolean) => setSelected((s) => pickRows(s, [brief(c)], on))

  const research = async (targets: CompanyBrief[]) => {
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
      setSelected(new Map())
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
      setSelected(new Map())
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
          <ManagerOnly>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Search /> Find companies <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setFinding("google_maps")}>
                  <MapPin /> On Google Maps
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setFinding("apollo")}>
                  <Search /> On Apollo
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setFinding("lead_intel")}>
                  <Download /> From Lead Intel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ManagerOnly>
        </div>
      </div>

      {(counts.review ?? 0) > 0 && filter !== "review" && (
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

      {/* One row: more filters and which records, then saved views. The fields open under it. */}
      <div className="flex flex-wrap items-center gap-2">
        <FacetFilters values={extra} onChange={(value) => { setExtra(value); setPage(1) }} count={total} fields={[{key:"source",label:"Company source",options:choices(companies.data?.sources ?? [])},{key:"location",label:"Company location",type:"text",placeholder:"City or state"},{key:"website",label:"Website",options:PRESENCE_OPTIONS},{key:"contacts",label:"People found",options:PRESENCE_OPTIONS},{key:"scoreBand",label:"Company score",options:SCORE_OPTIONS},{key:"icpState",label:"ICP assignment",options:PRESENCE_OPTIONS}]} />
        <ArchiveFilter value={archiveFilter} onChange={(value) => { setArchiveFilter(value); setSelected(new Map()); setPage(1) }} />
        <div className="ml-auto">
          <ListTools wsId={wsId} scope="companies" filters={{ query, icpId, filter, archive: archiveFilter, ...extra }} onApply={(v) => { setExtra(pickFacets(v, ["source","location","website","contacts","scoreBand","icpState"])); setQuery(v.query ?? ""); setIcpId(v.icpId ?? "all"); setFilter(["all", "review", "qualified", "found", "not_fit", "error"].includes(v.filter) ? v.filter as "all" | PipelineStatus : "all"); setArchiveFilter(["active", "archived", "all"].includes(v.archive) ? v.archive : "active"); setSelected(new Map()); setPage(1) }} onRefresh={() => companies.reload()} />
        </div>
      </div>
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
            {f.label} <span className="tabular-nums opacity-70">{counts[f.value] ?? 0}</span>
          </button>
        ))}
      </div>

      {picked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm tabular-nums">{picked.length} selected</span>
          <BulkSelection matchingIds={(matching.data ?? []).map((row) => row.id)} pageIds={shown.map((row) => row.id)} selected={new Set(selected.keys())}
            onChange={(ids) => setSelected((s) => new Map([...ids].map((id) => [id, s.get(id) ?? (matching.data ?? []).find((m) => m.id === id)!]).filter(([, row]) => row) as [string, CompanyBrief][]))}
            disabled={!!busy || !matching.data} />
          <ArchiveRecordsButton workspaceId={wsId} kind="company" ids={picked.map((row) => row.id)} restore={archiveFilter === "archived"} disabled={!!busy}
            onChanged={() => { setSelected(new Map()); companies.reload() }} />
          <DeleteRecordsButton workspaceId={wsId} kind="company" ids={picked.map((row) => row.id)} disabled={!!busy}
            onDeleted={() => { setSelected(new Map()); setPage(1); companies.reload() }} />
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Map())}>
            Clear
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            {/* One obvious next step for what's selected; everything else under More. */}
            {next && (
              <ManagerOnly>
                <Button size="sm" disabled={!!busy} onClick={next.run}>
                  <next.icon /> {busy === next.busy ? next.doing : next.label}
                </Button>
              </ManagerOnly>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={!!busy}>
                  More <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {more.map((a) => (
                  <DropdownMenuItem key={a.label} disabled={!canManage(me?.role) || a.disabled} onSelect={a.run}>
                    <a.icon /> {a.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {companies.error && !companies.data ? (
        <BackendError message={companies.error} onRetry={companies.reload} />
      ) : companies.loading && !companies.data ? (
        <TableSkeleton rows={6} />
      ) : (counts.all ?? 0) === 0 ? (
        <EmptyState
          icon={Building2}
          title={activeIcp ? `No companies for ${activeIcp.name} yet` : "No companies yet"}
          description="Use Find companies above: search Google Maps or Apollo, or bring them in from Lead Intel."
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
      ) : total === 0 ? (
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
                      setSelected((set) => pickRows(set, shown.map(brief), v === true))
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
                    <Checkbox aria-label={`Select ${c.name}`} checked={selected.has(c.id)} onCheckedChange={(v) => toggle(c, v === true)} />
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
                    {c.peopleCount ? (
                      <Link
                        href={`/companies/${c.id}?tab=people`}
                        className="text-data hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.peopleCount}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    {c.status === "qualified" ? (
                      <Button size="sm" variant="outline" onClick={() => setStakeholdersFor([brief(c)])}>
                        <UserSearch /> People
                      </Button>
                    ) : needsResearch(brief(c)) ? (
                      <ManagerOnly><Button size="sm" variant="outline" disabled={!!busy} onClick={() => void research([brief(c)])}>
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
              total={total}
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
            setSelected(new Map())
            companies.reload()
          }}
        />
      )}
      {readingPosts && (
        <ReadPostsDialog
          wsId={wsId}
          companyIds={readingPosts}
          onClose={() => setReadingPosts(null)}
          onDone={() => {
            setSelected(new Map())
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
            setSelected(new Map())
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
