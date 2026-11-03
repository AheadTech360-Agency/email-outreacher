"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Download, ExternalLink, FileUp, MailCheck, Newspaper, Search, Sparkles, UserPlus, UserSearch } from "lucide-react"
import { toast } from "sonner"
import { BackendError, WorkspaceGate } from "@/components/companies/backend-state"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { ManagerOnly } from "@/components/manager-only"
import { PageHeader } from "@/components/page-header"
import { Pager } from "@/components/pager"
import { AddPersonDialog, ImportPeopleDialog } from "@/components/people/add-people"
import { PostsSheet } from "@/components/people/posts-sheet"
import { Pill, type PillTone } from "@/components/status"
import { TableSkeleton } from "@/components/table-skeleton"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  type ApiPost,
  type Stakeholder,
  addAsLeads,
  downloadCsv,
  fetchAllStakeholders,
  fetchPipeline,
  fetchIcps,
  fetchLeadPosts,
  fetchPosts,
  generateEmails,
  revealStakeholders,
  useApi,
} from "@/lib/api"
import { postsCeiling, postsSummary } from "@/lib/costs"
import { formatUsd, shortDate } from "@/lib/format"
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
const isVerified = (s: Stakeholder) => !!s.email && ["verified", "valid"].includes((s.emailStatus ?? "").toLowerCase())

/** Unrevealed Apollo people only have a masked name and no contact, so they need revealing first. */
const canBeLead = (s: Stakeholder) => !s.leadId && !!(s.linkedinUrl || s.email) && !(s.source === "apollo" && !s.revealedAt)

/** Everyone found for this workspace, by company, ICP or LinkedIn, and turning them into leads with posts. */
export function PeopleView() {
  const { currentWorkspaceId, workspaces } = useStore()
  const workspace = workspaces.find((w) => w.id === currentWorkspaceId)
  return (
    <>
      <PageHeader
        title="People"
        description={`Stakeholders found for ${workspace?.name ?? "this workspace"}. Make them leads, fetch their posts, and reveal emails.`}
      />
      <div className="space-y-4 px-4 pb-10 md:px-8">
        <WorkspaceGate>{(wsId) => <PeopleList key={wsId} wsId={wsId} />}</WorkspaceGate>
      </div>
    </>
  )
}

function PeopleList({ wsId }: { wsId: string }) {
  const router = useRouter()
  const people = useApi(() => fetchAllStakeholders(wsId), [wsId])
  // Adding, importing and revealing people can make leads, and fetching changes post counts, so the
  // shared leads list reloads whenever this list does.
  const { reloadLeads } = useStore()
  useEffect(() => {
    if (people.data) reloadLeads()
  }, [people.data, reloadLeads])
  const icps = useApi(() => fetchIcps(wsId), [wsId])
  // Names of the pipeline companies people were found at; the rest carry their employer's name as found.
  const companies = useApi(() => fetchPipeline(wsId), [wsId])
  const posts = useApi(() => fetchPosts(wsId), [wsId])
  const [query, setQuery] = useState("")
  const [foundBy, setFoundBy] = useState("all")
  const [status, setStatus] = useState("all")
  const [emailFilter, setEmailFilter] = useState("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmingReveal, setConfirmingReveal] = useState(false)
  const [confirmingWrite, setConfirmingWrite] = useState(false)
  const [fetchingPosts, setFetchingPosts] = useState(false)
  const [adding, setAdding] = useState<"one" | "csv" | null>(null)
  const [busy, setBusy] = useState("")
  const [reading, setReading] = useState<Stakeholder | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  const list = people.data ?? []
  const icpName = new Map((icps.data ?? []).map((i) => [i.id, i.name]))
  const companyName = new Map((companies.data ?? []).map((c) => [c.id, c.name]))
  const company = (s: Stakeholder) => (s.pipelineCompanyId && companyName.get(s.pipelineCompanyId)) || s.organizationName || "—"
  const postsByLead = new Map<string, ApiPost[]>()
  for (const p of posts.data ?? []) postsByLead.set(p.leadId, [...(postsByLead.get(p.leadId) ?? []), p])

  const q = query.trim().toLowerCase()
  const visible = list.filter(
    (s) =>
      (foundBy === "all" ||
        (foundBy === "company"
          ? s.source === "apollo" && !s.icpId
          : foundBy === "linkedin"
            ? s.source === "apify_linkedin"
            : foundBy === "manual"
              ? s.source === "manual"
              : s.icpId === foundBy)) &&
      (status === "all" ||
        (status === "lead"
          ? !!s.queuedAt
          : status === "notlead"
            ? !s.queuedAt
            : status === "revealed"
              ? !!s.revealedAt
              : !s.revealedAt)) &&
      (emailFilter === "all" ||
        (emailFilter === "none" ? !s.email : emailFilter === "verified" ? isVerified(s) : !!s.email)) &&
      (!q || `${s.firstName} ${s.lastName} ${s.title} ${company(s)} ${s.email ?? ""}`.toLowerCase().includes(q)),
  )
  // One page of the filtered people; a filter that shrinks the list past this page shows its last page.
  const pages = Math.max(1, Math.ceil(visible.length / pageSize))
  const current = Math.min(page, pages)
  const shown = visible.slice((current - 1) * pageSize, current * pageSize)
  const picked = list.filter((s) => selected.has(s.id))
  // People who already have an email (from the LinkedIn email search) aren't revealed again: that would spend a credit.
  const toReveal = picked.filter((s) => !s.revealedAt && !s.email)
  const toAdd = picked.filter(canBeLead)
  const withLead = picked.filter((s) => s.leadId)
  const allChecked = shown.length > 0 && shown.every((s) => selected.has(s.id))
  const allShownPicked = visible.length > 0 && visible.every((s) => selected.has(s.id))
  const filtering = !!q || foundBy !== "all" || status !== "all" || emailFilter !== "all"

  const toggle = (id: string, on: boolean) =>
    setSelected((set) => {
      const next = new Set(set)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

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
      setSelected(new Set())
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
    const ids = withLead.map((s) => s.leadId!)
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
      setSelected(new Set())
    } catch (e) {
      // What was written before the failure is kept in Review.
      toast.error(drafted ? `Stopped after ${drafted} drafted` : "Couldn't write them", { id, description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy("")
    }
  }

  const addLeads = async () => {
    setBusy("add")
    try {
      const r = await addAsLeads(wsId, toAdd.map((s) => s.id))
      toast.success(`${r.added} added as ${r.added === 1 ? "a lead" : "leads"}`, {
        description: r.linkedExisting ? `${r.linkedExisting} were already leads and are now linked.` : undefined,
      })
      setSelected(new Set())
      people.reload()
    } catch (e) {
      toast.error("Couldn't add them", { description: e instanceof Error ? e.message : undefined })
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
        <Select
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
        </Select>
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
        {visible.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(allShownPicked ? new Set() : new Set(visible.map((s) => s.id)))}
          >
            {allShownPicked ? "Clear selection" : `Select all ${visible.length.toLocaleString()}${filtering ? " matching" : ""}`}
          </Button>
        )}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Button size="sm" variant="outline" onClick={() => setAdding("csv")}>
            <FileUp /> Import CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            title="Everyone here: email, ICP, smart list and whether they're a lead. Apollo's format is on Smart lists."
            onClick={() => void downloadCsv(wsId, "/stakeholders/export.csv", "people.csv").catch((e) => toast.error(e.message))}
          >
            <Download /> Export
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAdding("one")}>
            <UserPlus /> Add a person
          </Button>
        </div>
      </div>

      {picked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm tabular-nums">{picked.length} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!toAdd.length || !!busy} onClick={() => void addLeads()}>
              <UserPlus /> {busy === "add" ? "Adding…" : `Add ${toAdd.length} as leads`}
            </Button>
            <ManagerOnly><Button
              size="sm"
              variant="outline"
              disabled={!withLead.length || withLead.length > MAX_LEADS || !!busy}
              title={withLead.length > MAX_LEADS ? `Fetch posts for up to ${MAX_LEADS} leads at a time` : undefined}
              onClick={() => setFetchingPosts(true)}
            >
              <Newspaper /> Fetch posts for {withLead.length}
            </Button></ManagerOnly>
            <ManagerOnly><Button
              size="sm"
              variant="outline"
              disabled={!withLead.length || withLead.length > MAX_LEADS || !!busy}
              title={withLead.length > MAX_LEADS ? `Write emails for up to ${MAX_LEADS} leads at a time` : undefined}
              onClick={() => (withLead.length > BATCH ? setConfirmingWrite(true) : void writeEmails())}
            >
              <Sparkles /> {busy === "write" ? "Writing…" : `Write emails for ${withLead.length}`}
            </Button></ManagerOnly>
            <ManagerOnly><Button
              size="sm"
              disabled={!toReveal.length || toReveal.length > MAX_REVEAL || !!busy}
              title={toReveal.length > MAX_REVEAL ? `Reveal up to ${MAX_REVEAL} at a time` : undefined}
              onClick={() => setConfirmingReveal(true)}
            >
              <MailCheck /> {busy === "reveal" ? "Revealing…" : `Reveal ${toReveal.length} ${toReveal.length === 1 ? "email" : "emails"}`}
            </Button></ManagerOnly>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState
          icon={UserSearch}
          title="Nobody found yet"
          description="Find them at qualified companies, or add them yourself: one by hand, or a CSV exported from Apollo."
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
      ) : visible.length === 0 ? (
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
                      setSelected((set) => {
                        const next = new Set(set)
                        shown.forEach((s) => (v === true ? next.add(s.id) : next.delete(s.id)))
                        return next
                      })
                    }
                  />
                </TableHead>
                <TableHead>Person</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Found by</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Found</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((s) => {
                const cell = emailCell(s)
                const leadPosts = s.leadId ? (postsByLead.get(s.leadId) ?? []) : []
                return (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => router.push(`/people/${s.id}`)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        aria-label={`Select ${s.firstName}`}
                        checked={selected.has(s.id)}
                        onCheckedChange={(v) => toggle(s.id, v === true)}
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
                          {company(s)}
                        </Link>
                      ) : (
                        company(s)
                      )}
                    </TableCell>
                    <TableCell>
                      {s.source === "apify_linkedin" ? (
                        <Pill tone="info">LinkedIn</Pill>
                      ) : s.source === "manual" ? (
                        <Pill>Added by you</Pill>
                      ) : s.icpId ? (
                        <Pill>ICP: {icpName.get(s.icpId) ?? "deleted ICP"}</Pill>
                      ) : (
                        <span className="text-[13px] text-muted-foreground">Apollo, by company</span>
                      )}
                    </TableCell>
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
                            {leadPosts.length ? `${leadPosts.length} ${leadPosts.length === 1 ? "post" : "posts"}` : "No posts yet"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[13px] text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{shortDate(s.foundAt)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <div className="border-t px-3 py-2">
            <Pager
              page={current}
              pageSize={pageSize}
              total={visible.length}
              onPage={setPage}
              onPageSize={(n) => {
                setPageSize(n)
                setPage(1)
              }}
            />
          </div>
        </div>
      )}

      {adding === "one" && (
        <AddPersonDialog workspaceId={wsId} icps={icps.data ?? []} onClose={() => setAdding(null)} onAdded={people.reload} />
      )}
      {adding === "csv" && (
        <ImportPeopleDialog workspaceId={wsId} icps={icps.data ?? []} onClose={() => setAdding(null)} onImported={people.reload} />
      )}
      {fetchingPosts && (
        <FetchPostsDialog
          wsId={wsId}
          people={withLead}
          onClose={() => setFetchingPosts(false)}
          onDone={() => {
            setSelected(new Set())
            posts.reload()
          }}
        />
      )}
      {reading && (
        <PostsSheet
          name={`${reading.firstName} ${reading.lastName}`.trim()}
          posts={reading.leadId ? (postsByLead.get(reading.leadId) ?? []) : []}
          loading={posts.loading && !posts.data}
          onClose={() => setReading(null)}
        />
      )}
      <ConfirmDialog
        open={confirmingReveal}
        onOpenChange={setConfirmingReveal}
        title={`Reveal ${toReveal.length} ${toReveal.length === 1 ? "email" : "emails"}?`}
        description="This uses Apollo credits: about 1 per person whose email comes back, and none when Apollo has no match. Revealed people are added as leads, and are never charged for twice."
        confirmLabel={`Reveal ${toReveal.length}`}
        onConfirm={() => void reveal()}
      />
      <ConfirmDialog
        open={confirmingWrite}
        onOpenChange={setConfirmingWrite}
        title={`Write ${withLead.length} emails?`}
        description={`Claude writes one email for each, ${BATCH} at a time. About ${formatUsd(withLead.length * COST_PER_EMAIL)} in all, logged on Usage. Drafts wait in Review; nothing is sent. Leads without posts get an email without them, so fetch posts first. Keep this tab open until it finishes: a big selection takes a while.`}
        confirmLabel={`Write ${withLead.length}`}
        onConfirm={() => {
          setConfirmingWrite(false)
          void writeEmails()
        }}
      />
    </>
  )
}

/** Choose how many posts and how far back, see the most it can cost, then fetch. */
function FetchPostsDialog({
  wsId,
  people,
  onClose,
  onDone,
}: {
  wsId: string
  people: Stakeholder[]
  onClose: () => void
  onDone: () => void
}) {
  const [maxPosts, setMaxPosts] = useState("3")
  const [days, setDays] = useState("60")
  const [running, setRunning] = useState(false)
  const n = Number(maxPosts)
  const d = Number(days)
  const bad = !(Number.isInteger(n) && n >= 1 && n <= 20) || !(Number.isInteger(d) && d >= 1 && d <= 365)
  const ceiling = postsCeiling(people.length, n, ["linkedin", "instagram"])

  const [done, setDone] = useState(0)

  const run = async () => {
    setRunning(true)
    let fresh = 0
    let cost = 0
    const all: { enough: boolean; new: number; stoppedAt: string | null }[] = []
    try {
      for (const [i, group] of chunks(people).entries()) {
        setDone(i * BATCH)
        const r = await fetchLeadPosts(wsId, { leadIds: group.map((s) => s.leadId!), maxPosts: n, maxAgeDays: d })
        fresh += r.results.reduce((sum, x) => sum + x.new, 0)
        cost += (r.costUsd ?? 0) + r.claudeCostUsd
        all.push(...r.results)
        if (r.error) {
          toast.error("Apify refused", { description: r.error })
          onDone()
          return onClose()
        }
      }
      toast.success(postsSummary(all), { description: `${fresh} new posts saved. ${formatUsd(cost)} with Claude's checks.` })
      onDone()
      onClose()
    } catch (e) {
      toast.error("Couldn't fetch posts", { description: e instanceof Error ? e.message : undefined })
      onDone()
      setRunning(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className="sm:max-w-md!">
        <DialogHeader>
          <DialogTitle>
            Fetch posts for {people.length} {people.length === 1 ? "lead" : "leads"}
          </DialogTitle>
          <DialogDescription>
            Their LinkedIn posts, and Instagram posts from their own account or their company&apos;s (already found by
            Lead Intel). Fetched through Apify, paid per post.
          </DialogDescription>
        </DialogHeader>
        <form
          id="fetch-posts"
          className="grid grid-cols-2 gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!bad) void run()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="posts-max">Posts per source</Label>
            <Input id="posts-max" type="number" inputMode="numeric" value={maxPosts} onChange={(e) => setMaxPosts(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="posts-days">From the last (days)</Label>
            <Input id="posts-days" type="number" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <p className={bad ? "col-span-2 text-xs text-destructive" : "col-span-2 text-xs text-muted-foreground tabular-nums"}>
            {bad
              ? "Posts: 1 to 20. Days: 1 to 365."
              : `At most about ${formatUsd(ceiling)}, if every lead has both sources and that many posts.${people.length > BATCH ? ` Runs ${BATCH} leads at a time: keep this tab open until it finishes.` : ""}`}
          </p>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button type="submit" form="fetch-posts" disabled={running || bad}>
            <Newspaper /> {running ? (people.length > BATCH ? `Fetching… ${done} of ${people.length} done` : "Fetching… this can take a minute") : "Fetch posts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
