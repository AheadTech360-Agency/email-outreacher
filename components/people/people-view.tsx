"use client"

import { FacetFilters } from "@/components/facet-filters"
import { choices, pickFacets, PRESENCE_OPTIONS } from "@/lib/facets"
import { type PeopleFilters, type PersonBrief, type PersonRow, fetchMatchingPeople, fetchPeopleLeadIds, fetchPeoplePage } from "@/lib/lists"
import { pickRows, useDebounced } from "@/lib/use-debounced"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { ChevronDown, DatabaseZap, Download, ExternalLink, FileUp, MailCheck, Newspaper, Search, Sparkles, UserPlus, UserSearch } from "lucide-react"
import { toast } from "sonner"
import { BackendError, WorkspaceGate } from "@/components/companies/backend-state"
import { ArchiveFilter, ArchiveRecordsButton } from "@/components/archive-records"
import { ListTools, BulkSelection } from "@/components/list-tools"
import { DeleteRecordsButton } from "@/components/delete-records-button"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EnrichDialog } from "@/components/enrich-dialog"
import { ReadPostsDialog } from "@/components/read-posts-dialog"
import { EmptyState } from "@/components/empty-state"
import { ManagerOnly } from "@/components/manager-only"
import { PageHeader } from "@/components/page-header"
import { Pager } from "@/components/pager"
import { AddPersonDialog, ImportPeopleDialog } from "@/components/people/add-people"
import { PostsSheet } from "@/components/people/posts-sheet"
import { Pill, type PillTone } from "@/components/status"
import { TableSkeleton } from "@/components/table-skeleton"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  type Stakeholder,
  addAsLeads,
  downloadCsv,
  fetchIcps,
  fetchPosts,
  generateEmails,
  revealStakeholders,
  useApi,
} from "@/lib/api"
import { ColumnPicker, type ColumnDef, safeHref, useColumns } from "@/components/column-picker"
import { formatUsd, shortDate } from "@/lib/format"
import { useAuth } from "@/lib/auth"
import { canManage, isProspector } from "@/lib/roles"
import { useStore } from "@/lib/store"

const MAX_REVEAL = 25
// Posts and emails run 25 leads to a job (the server's limit); a bigger selection runs as several, one after another.
const BATCH = 25
const MAX_LEADS = 2000
const COST_PER_EMAIL = 0.003 // hook, email and score on Haiku

function chunks<T>(items: T[], size = BATCH): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function emailCell(s: Stakeholder): { text: string; tone: PillTone } {
  // Found by the LinkedIn email search: Apify's check says how sure it is.
  if (s.email && !s.revealedAt) {
    if (s.emailStatus === "valid") return { text: "Valid email", tone: "positive" }
    if (s.emailStatus === "risky") return { text: "Risky email", tone: "warning" }
    if (s.emailStatus === "website") return { text: "Website email", tone: "warning" }
    return { text: s.emailStatus ? `Email (${s.emailStatus})` : "Has email", tone: "info" }
  }
  if (!s.revealedAt) {
    if (s.source === "apify_linkedin") return { text: "Not looked up", tone: "neutral" }
    return s.hasEmail ? { text: "Has email", tone: "info" } : { text: "No email on file", tone: "neutral" }
  }
  if (s.emailStatus === "no_match") return { text: "No match", tone: "neutral" }
  if (!s.email) return { text: "No email found", tone: "neutral" }
  return { text: s.emailStatus ?? "Email", tone: s.emailStatus === "verified" ? "positive" : "warning" }
}

/** An email the source checked: Apollo's "verified" or the LinkedIn search's "valid". */
/** Everyone found for this workspace, by company, ICP or LinkedIn, and turning them into leads with posts. */
// Only an http(s) address becomes a link; anything else is shown as text (column-picker.safeHref).
const linkCell = (raw: string | null, label?: string) => {
  const href = safeHref(raw)
  if (!raw) return <span className="text-muted-foreground">—</span>
  if (!href) return <span>{raw}</span>
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-[13px] hover:underline" onClick={(e) => e.stopPropagation()}>
      {label ?? raw.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
    </a>
  )
}
const textOf = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v))

/** Columns the People table can also show ("More columns"). */
const PERSON_COLUMNS: ColumnDef<PersonRow>[] = [
  { key: "title", label: "Title", cell: (s) => s.title || "—", text: (s) => s.title },
  { key: "seniority", label: "Seniority", cell: (s) => s.seniority || "—", text: (s) => textOf(s.seniority) },
  { key: "email", label: "Email address", cell: (s) => s.email || "—", text: (s) => textOf(s.email) },
  { key: "emailStatus", label: "Email status", cell: (s) => s.emailStatus || "—", text: (s) => textOf(s.emailStatus) },
  { key: "linkedin", label: "LinkedIn URL", cell: (s) => linkCell(s.linkedinUrl), text: (s) => textOf(s.linkedinUrl) },
  { key: "posts", label: "Posts", cell: (s) => s.postCount || "—", text: (s) => String(s.postCount) },
  { key: "revealed", label: "Email revealed", cell: (s) => (s.revealedAt ? shortDate(s.revealedAt) : "—"), text: (s) => textOf(s.revealedAt) },
]

export function PeopleView() {
  return (
    <>
      <PageHeader
        title="People"
        description="The people you could email. Select them, then write their emails."
      />
      <div className="space-y-4 px-4 pb-10 md:px-8">
        <WorkspaceGate>{(wsId) => <PeopleList key={wsId} wsId={wsId} />}</WorkspaceGate>
      </div>
    </>
  )
}

function PeopleList({ wsId }: { wsId: string }) {
  const router = useRouter()
  const { me } = useAuth()
  const extraColumns = useColumns("people-extra", PERSON_COLUMNS, [])
  // A Prospector reads the people at their companies: no exports, adding or actions.
  const prospector = isProspector(me?.role)
  // Adding, importing and revealing people can make leads, and fetching changes post counts, so the
  // shared leads list reloads whenever this list does.
  const { reloadLeads } = useStore()
  const icps = useApi(() => fetchIcps(wsId), [wsId])
  const [query, setQuery] = useState("")
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [foundBy, setFoundBy] = useState("all")
  const [status, setStatus] = useState("all")
  const [emailFilter, setEmailFilter] = useState("all")
  // Picked people, with the fields their bulk actions read: kept across pages.
  const [selected, setSelected] = useState<Map<string, PersonBrief>>(new Map())
  const [confirmingReveal, setConfirmingReveal] = useState(false)
  const [confirmingWrite, setConfirmingWrite] = useState(false)
  const [fillingIn, setFillingIn] = useState(false)
  const [fetchingPosts, setFetchingPosts] = useState(false)
  const [adding, setAdding] = useState<"one" | "csv" | null>(null)
  const [busy, setBusy] = useState("")
  const [reading, setReading] = useState<Stakeholder | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  const [archiveFilter, setArchiveFilter] = useState("active")
  // The server filters and pages; typing waits for a pause before it asks.
  const typedQuery = useDebounced(query)
  const typedCompany = useDebounced(extra.companyText ?? "")
  const filters: PeopleFilters = useMemo(() => ({
    archive: archiveFilter, q: typedQuery, foundBy, status, email: emailFilter, linkedin: extra.linkedin, postState: extra.postState,
    emailState: extra.emailState, companyText: typedCompany,
  }), [archiveFilter, typedQuery, foundBy, status, emailFilter, extra.linkedin, extra.postState, extra.emailState, typedCompany])  // prettier-ignore
  const people = useApi(() => fetchPeoplePage(wsId, filters, page, pageSize), [wsId, filters, page, pageSize])
  // Adding, importing and revealing people can make leads, so pages showing leads refresh when this list does.
  useEffect(() => {
    if (people.data) reloadLeads()
  }, [people.data, reloadLeads])
  // Every match, only when needed: while people are picked (Select all N matching) or for Delete all without email.
  const needAll = selected.size > 0 || emailFilter === "none"
  const matching = useApi(() => (needAll ? fetchMatchingPeople(wsId, filters) : Promise.resolve(null)), [wsId, filters, needAll])
  // The posts of the person whose posts are open, read when they're opened.
  const readingLead = reading?.leadId ?? null
  const posts = useApi(() => (readingLead ? fetchPosts(wsId, readingLead) : Promise.resolve([])), [wsId, readingLead])
  const icpName = new Map((icps.data ?? []).map((i) => [i.id, i.name]))
  const total = people.data?.total ?? 0
  const shown: PersonRow[] = people.data?.items ?? []
  const brief = (s: PersonRow): PersonBrief => ({ id: s.id, email: s.email, revealedAt: s.revealedAt, linkedinUrl: s.linkedinUrl, leadId: s.leadId })

  const current = page
  // A page past the end (people left the filter, or were deleted) moves back to the last page.
  if (people.data && !people.data.items.length && total > 0 && page > 1) setPage(Math.max(1, Math.ceil(total / pageSize)))
  const picked = [...selected.values()]
  // People who already have an email (from the LinkedIn email search) aren't revealed again: that would spend a credit.
  const toReveal = picked.filter((s) => !s.revealedAt && !s.email)
  const withLinkedin = picked.filter((s) => s.linkedinUrl)
  // Who an email can be written for: anyone with an address.
  const writable = picked.filter((s) => s.email)
  const allChecked = shown.length > 0 && shown.every((s) => selected.has(s.id))

  const actions = [
    { key: "write", label: `Write emails for ${writable.length}`, doing: "Writing…", busy: "write", icon: Sparkles,
      disabled: !writable.length || writable.length > MAX_LEADS,
      title: writable.length > MAX_LEADS ? `Up to ${MAX_LEADS} at a time` : "Claude writes one email each; they wait in Emails to review",
      run: () => (writable.length > BATCH ? setConfirmingWrite(true) : void writeEmails()) },
    { key: "reveal", label: `Reveal ${toReveal.length} ${toReveal.length === 1 ? "email" : "emails"}`, doing: "Revealing…", busy: "reveal",
      icon: MailCheck, disabled: !toReveal.length || toReveal.length > MAX_REVEAL, title: "Uses Apollo credits",
      run: () => setConfirmingReveal(true) },
    { key: "posts", label: `Read posts for ${picked.length}`, doing: "", busy: "", icon: Newspaper,
      disabled: picked.length > MAX_LEADS, title: undefined, run: () => setFetchingPosts(true) },
    { key: "fill", label: `Get LinkedIn profiles for ${withLinkedin.length}`, doing: "", busy: "", icon: DatabaseZap,
      disabled: !withLinkedin.length, title: undefined, run: () => setFillingIn(true) },
  ]  // prettier-ignore
  // The next step: write to whoever has an email; otherwise find their emails.
  const nextKey = writable.length ? "write" : toReveal.length ? "reveal" : null
  const next = actions.find((a) => a.key === nextKey)
  const more = actions.filter((a) => a.key !== nextKey)

  const toggle = (s: PersonRow, on: boolean) => setSelected((set) => pickRows(set, [brief(s)], on))

  const reveal = async () => {
    setBusy("reveal")
    try {
      const r = await revealStakeholders(wsId, toReveal.map((s) => s.id))
      if (r.error) toast.error("Apollo refused", { description: r.error })
      const leads = r.outcomes.filter((o) => o.leadCreated).length
      const noMatch = r.outcomes.filter((o) => o.status === "no_match").length
      if (r.revealed || noMatch)
        toast.success(`Revealed ${r.revealed} ${r.revealed === 1 ? "person" : "people"}`, {
          description:
            [leads ? `${leads} added as leads.` : "", noMatch ? `${noMatch} had no match (no credits used).` : ""]
              .filter(Boolean)
              .join(" ") || undefined,
        })
      setSelected(new Map())
      people.reload()
    } catch (e) {
      toast.error("Couldn't reveal", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy("")
    }
  }

  // Hook selection then email generation for each lead, on its ICP's prompts. Drafts go to Review.
  const writeEmails = async () => {
    setBusy("write")
    // Anyone with an email gets the working record their drafts are kept on (not a lead until it's queued).
    const missing = writable.filter((s) => !s.leadId).map((s) => s.id)
    let ids = writable.filter((s) => s.leadId).map((s) => s.leadId!)
    if (missing.length) {
      try {
        for (const group of chunks(missing, 100)) await addAsLeads(wsId, group)
        // Their leads now: read for just these people, not the whole list.
        const byId: Record<string, string | null> = {}
        for (const group of chunks(writable.map((s) => s.id), 1000)) Object.assign(byId, await fetchPeopleLeadIds(wsId, group))
        ids = writable.map((s) => byId[s.id] ?? s.leadId).filter((x): x is string => !!x)
      } catch (e) {
        toast.error("Couldn't get them ready", { description: e instanceof Error ? e.message : undefined })
        return setBusy("")
      }
    }
    const id = toast.loading(`Writing ${ids.length} ${ids.length === 1 ? "email" : "emails"}… this can take a few minutes`)
    let drafted = 0
    let cost = 0
    const problems: { reason?: string | null }[] = []
    try {
      const groups = chunks(ids)
      for (const [i, group] of groups.entries()) {
        if (groups.length > 1) toast.loading(`Writing emails: ${i * BATCH} of ${ids.length} done…`, { id })
        const r = await generateEmails(wsId, group)
        drafted += r.drafted
        cost += r.costUsd ?? 0
        problems.push(...r.results.filter((x) => x.status !== "drafted"))
      }
      const reasons = [...new Set(problems.map((x) => x.reason).filter(Boolean))]
      const summary = `${drafted} drafted${problems.length ? `, ${problems.length} not` : ""}`
      const description = [cost ? `Claude cost ${formatUsd(cost)}.` : "", ...reasons].filter(Boolean).join(" ") || undefined
      if (drafted) toast.success(summary, { id, description, action: { label: "Review", onClick: () => router.push("/review") } })
      else toast.error(summary, { id, description })
      setSelected(new Map())
    } catch (e) {
      // What was written before the failure is kept in Review.
      toast.error(drafted ? `Stopped after ${drafted} drafted` : "Couldn't write them", { id, description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy("")
    }
  }

  if (people.error && !people.data) return <BackendError message={people.error} onRetry={people.reload} />
  if (people.loading && !people.data) return <TableSkeleton rows={6} />

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search people"
            placeholder="Search name, title or company"
            className="pl-8"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
          />
        </div>
        {!prospector && <Select
          value={foundBy}
          onValueChange={(v) => {
            setFoundBy(v)
            setPage(1)
          }}
        >
          <SelectTrigger aria-label="Filter by how they were found" className="w-52!">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Found any way</SelectItem>
            <SelectItem value="company">Apollo company search</SelectItem>
            <SelectItem value="linkedin">LinkedIn (Apify)</SelectItem>
            <SelectItem value="manual">Added by hand or CSV</SelectItem>
            {(icps.data ?? []).map((i) => (
              <SelectItem key={i.id} value={i.id}>
                ICP: {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>}
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
        >
          <SelectTrigger aria-label="Filter by status" className="w-44!">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="hidden">Email not revealed</SelectItem>
            <SelectItem value="revealed">Email revealed</SelectItem>
            <SelectItem value="lead">Leads (queued)</SelectItem>
            <SelectItem value="notlead">Not a lead</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={emailFilter}
          onValueChange={(v) => {
            setEmailFilter(v)
            setPage(1)
          }}
        >
          <SelectTrigger aria-label="Filter by email" className="w-40!">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any email</SelectItem>
            <SelectItem value="has">Has an email</SelectItem>
            <SelectItem value="verified">Verified email</SelectItem>
            <SelectItem value="none">No email</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {!prospector && <Button
            size="sm"
            variant="outline"
            title="Everyone here: email, ICP, smart list and whether they're a lead. Apollo's format is on Smart lists."
            onClick={() => void downloadCsv(wsId, "/stakeholders/export.csv", "people.csv").catch((e) => toast.error(e.message))}
          >
            <Download /> Export
          </Button>}
          {!prospector && <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <UserPlus /> Add people <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setAdding("csv")}>
                <FileUp /> Import a CSV (from Apollo)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAdding("one")}>
                <UserPlus /> Add one person
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>}
        </div>
      </div>

      {/* One row: more filters and which records, then saved views. The fields open under it. */}
      <div className="flex flex-wrap items-center gap-2">
        <FacetFilters values={extra} onChange={(value) => { setExtra(value); setPage(1) }} count={total} fields={[{key:"linkedin",label:"LinkedIn profile",options:PRESENCE_OPTIONS},{key:"postState",label:"Fetched personal posts",options:PRESENCE_OPTIONS},{key:"emailState",label:"Email verification status",options:choices(people.data?.emailStatuses ?? [])},{key:"companyText",label:"Employer",type:"text",placeholder:"Search company name"}]} />
        <ArchiveFilter value={archiveFilter} onChange={(value) => { setArchiveFilter(value); setSelected(new Map()); setPage(1) }} />
        <div className="ml-auto">
          <ColumnPicker label="More columns" columns={PERSON_COLUMNS} shown={extraColumns.shown} onToggle={extraColumns.toggle} onReset={extraColumns.reset} />
          <ListTools wsId={wsId} scope="people" filters={{ query, foundBy, status, emailFilter, archive: archiveFilter, ...extra }} onApply={(v) => { setExtra(pickFacets(v, ["linkedin","postState","emailState","companyText"])); setQuery(v.query ?? ""); setFoundBy(v.foundBy ?? "all"); setStatus(["all", "hidden", "revealed", "lead", "notlead"].includes(v.status) ? v.status : "all"); setEmailFilter(["all", "none", "has", "verified"].includes(v.emailFilter) ? v.emailFilter : "all"); setArchiveFilter(["active", "archived", "all"].includes(v.archive) ? v.archive : "active"); setSelected(new Map()); setPage(1) }} onRefresh={() => people.reload()} />
        </div>
      </div>
      {emailFilter === "none" && total > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
          <span className="text-sm">{total} matching people without email addresses</span>
          <DeleteRecordsButton workspaceId={wsId} kind="person" ids={(matching.data ?? []).map((row) => row.id)}
            noEmailOnly label={`Delete all ${total} without email`} disabled={!!busy || total > 5000 || !matching.data}
            onDeleted={() => { setSelected(new Map()); setPage(1); people.reload(); reloadLeads() }} />
          {total > 5000 && <p className="text-xs text-muted-foreground">Narrow the filters to 5,000 people or fewer.</p>}
        </div>
      )}
      {picked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm tabular-nums">{picked.length} selected</span>
          <BulkSelection matchingIds={(matching.data ?? []).map((row) => row.id)} pageIds={shown.map((row) => row.id)} selected={new Set(selected.keys())}
            onChange={(ids) => setSelected((s) => new Map([...ids].map((id) => [id, s.get(id) ?? (matching.data ?? []).find((m) => m.id === id)!]).filter(([, row]) => row) as [string, PersonBrief][]))}
            disabled={!!busy || !matching.data} />
          <ArchiveRecordsButton workspaceId={wsId} kind="person" ids={picked.map((row) => row.id)} restore={archiveFilter === "archived"} disabled={!!busy}
            onChanged={() => { setSelected(new Map()); people.reload() }} />
          <DeleteRecordsButton workspaceId={wsId} kind="person" ids={picked.map((row) => row.id)} disabled={!!busy}
            onDeleted={() => { setSelected(new Map()); setPage(1); people.reload(); reloadLeads() }} />
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Map())}>
            Clear
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            {/* One obvious next step for who's selected; everything else under More. */}
            {next && (
              <ManagerOnly>
                <Button size="sm" disabled={!!busy || next.disabled} title={next.title} onClick={next.run}>
                  <next.icon /> {busy === next.busy ? next.doing : next.label}
                </Button>
              </ManagerOnly>
            )}
            {!prospector && <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={!!busy}>
                  More <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {more.map((a) => (
                  <DropdownMenuItem key={a.key} disabled={!canManage(me?.role) || a.disabled} onSelect={a.run}>
                    <a.icon /> {a.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>}
          </div>
        </div>
      )}

      {people.error && !people.data ? (
        <BackendError message={people.error} onRetry={people.reload} />
      ) : !people.data ? (
        <TableSkeleton rows={6} />
      ) : people.data.baseTotal === 0 ? (
        <EmptyState
          icon={UserSearch}
          title="Nobody found yet"
          description={prospector ? "The people your Quick Start runs find show up here." : "Find them at qualified companies, or add them yourself: one by hand, or a CSV exported from Apollo."}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/companies">Go to Companies</Link>
              </Button>
              <Button variant="outline" onClick={() => setAdding("csv")}>
                <FileUp /> Import CSV
              </Button>
              <Button variant="outline" onClick={() => setAdding("one")}>
                <UserPlus /> Add a person
              </Button>
            </div>
          }
        />
      ) : total === 0 ? (
        <EmptyState icon={Search} title="Nobody matches" description="Try another filter or search." />
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
                <TableHead>Person</TableHead>
                <TableHead>Company</TableHead>
                {!prospector && <TableHead>Found by</TableHead>}
                <TableHead>Email</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Found</TableHead>
                {extraColumns.visible.map((col) => (
                  <TableHead key={col.key} className="whitespace-nowrap">{col.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((s) => {
                const cell = emailCell(s)
                return (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => router.push(`/people/${s.id}`)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        aria-label={`Select ${s.firstName}`}
                        checked={selected.has(s.id)}
                        onCheckedChange={(v) => toggle(s, v === true)}
                      />
                    </TableCell>
                    <TableCell className="max-w-64">
                      <p className="truncate font-medium">
                        {s.firstName} {s.lastName}
                      </p>
                      <p className="truncate text-[13px] text-muted-foreground">{s.title || "No title"}</p>
                    </TableCell>
                    <TableCell className="max-w-56 truncate">
                      {s.pipelineCompanyId ? (
                        <Link
                          href={`/companies/${s.pipelineCompanyId}`}
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {s.companyName}
                        </Link>
                      ) : (
                        s.companyName
                      )}
                    </TableCell>
                    {!prospector && <TableCell>
                      {s.source === "apify_linkedin" ? (
                        <Pill tone="info">LinkedIn</Pill>
                      ) : s.source === "manual" ? (
                        <Pill>Added by you</Pill>
                      ) : s.icpId ? (
                        <Pill>ICP: {icpName.get(s.icpId) ?? "deleted ICP"}</Pill>
                      ) : (
                        <span className="text-[13px] text-muted-foreground">Apollo, by company</span>
                      )}
                    </TableCell>}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col items-start gap-0.5">
                        <Pill tone={cell.tone} className="capitalize">
                          {cell.text}
                        </Pill>
                        {s.email && <span className="text-[13px]">{s.email}</span>}
                        {s.linkedinUrl && (
                          <a
                            href={s.linkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 text-xs hover:underline"
                          >
                            LinkedIn <ExternalLink className="size-3" aria-hidden />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {s.leadId ? (
                        <div className="flex flex-col items-start gap-0.5">
                          {s.queuedAt ? <Pill tone="positive">Lead</Pill> : <Pill tone="neutral">Not queued yet</Pill>}
                          <button
                            type="button"
                            className="text-xs text-data hover:underline tabular-nums"
                            onClick={() => setReading(s)}
                          >
                            {s.postCount ? `${s.postCount} ${s.postCount === 1 ? "post" : "posts"}` : "No posts yet"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[13px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{shortDate(s.foundAt)}</TableCell>
                    {extraColumns.visible.map((col) => (
                      <TableCell key={col.key} className="max-w-56 truncate whitespace-nowrap text-[13px]">{col.cell(s)}</TableCell>
                    ))}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <div className="border-t px-3 py-2">
            <Pager
              page={current}
              pageSize={pageSize}
              total={total}
              onPage={setPage}
              onPageSize={(n) => {
                setPageSize(n)
                setPage(1)
              }}
            />
          </div>
        </div>
      )}

      {fillingIn && (
        <EnrichDialog
          wsId={wsId}
          personIds={withLinkedin.map((s) => s.id)}
          onClose={() => setFillingIn(false)}
          onDone={() => {
            setSelected(new Map())
            people.reload()
          }}
        />
      )}
      {adding === "one" && (
        <AddPersonDialog workspaceId={wsId} icps={icps.data ?? []} onClose={() => setAdding(null)} onAdded={people.reload} />
      )}
      {adding === "csv" && (
        <ImportPeopleDialog workspaceId={wsId} icps={icps.data ?? []} onClose={() => setAdding(null)} onImported={people.reload} />
      )}
      {fetchingPosts && (
        <ReadPostsDialog
          wsId={wsId}
          personIds={picked.map((s) => s.id)}
          onClose={() => setFetchingPosts(false)}
          onDone={() => {
            setSelected(new Map())
            people.reload()
          }}
        />
      )}
      {reading && (
        <PostsSheet
          name={`${reading.firstName} ${reading.lastName}`.trim()}
          posts={posts.data ?? []}
          loading={posts.loading}
          onClose={() => setReading(null)}
        />
      )}
      <ConfirmDialog
        open={confirmingReveal}
        onOpenChange={setConfirmingReveal}
        title={`Reveal ${toReveal.length} ${toReveal.length === 1 ? "email" : "emails"}?`}
        description="Uses about 1 Apollo credit per email found (none if Apollo has nothing). Never charged twice for the same person."
        confirmLabel={`Reveal ${toReveal.length}`}
        onConfirm={() => void reveal()}
      />
      <ConfirmDialog
        open={confirmingWrite}
        onOpenChange={setConfirmingWrite}
        title={`Write ${writable.length} emails?`}
        description={`About ${formatUsd(writable.length * COST_PER_EMAIL)}. The drafts wait in Emails to review; nothing is sent. Tip: read their posts first for more personal emails. Keep this tab open until it's done.`}
        confirmLabel={`Write ${writable.length}`}
        onConfirm={() => {
          setConfirmingWrite(false)
          void writeEmails()
        }}
      />
    </>
  )
}
