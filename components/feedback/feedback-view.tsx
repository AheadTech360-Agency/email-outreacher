"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { ArrowLeft, ArrowRight, ExternalLink, LayoutGrid, List, Mail, MessageSquareText, Search, SlidersHorizontal, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react"
import { toast } from "sonner"
import { BackendError, WorkspaceGate } from "@/components/companies/backend-state"
import { EmptyState } from "@/components/empty-state"
import { FeedbackControl, TAG_LABEL } from "@/components/feedback/feedback-control"
import { ManagerOnly } from "@/components/manager-only"
import { ListTools } from "@/components/list-tools"
import { Pager } from "@/components/pager"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { type EmailFilters as EmailListFilters, fetchEmail, fetchEmailIds, fetchEmailsPage, fetchRated } from "@/lib/lists"
import { useDebounced } from "@/lib/use-debounced"
import { PageHeader } from "@/components/page-header"
import { Pill } from "@/components/status"
import { TableSkeleton } from "@/components/table-skeleton"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  type ApiIcp,
  type EmailDraft,
  type PromptSuggestion,
  fetchIcps,
  rateEmail,
  saveEmailAsExample,
  suggestEmailPrompt,
  useApi,
} from "@/lib/api"
import { formatUsd, shortDate } from "@/lib/format"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

const MIN_RATED = 3
// The rating tabs; each counts the emails under the same search and filters (from the server).
const FILTERS: { value: string; label: string; count: (r: Partial<Record<"unrated" | "good" | "bad", number>>) => number }[] = [
  { value: "unrated", label: "Not rated", count: (r) => r.unrated ?? 0 },
  { value: "good", label: "Good", count: (r) => r.good ?? 0 },
  { value: "bad", label: "Bad", count: (r) => r.bad ?? 0 },
  { value: "all", label: "All", count: (r) => (r.unrated ?? 0) + (r.good ?? 0) + (r.bad ?? 0) },
]

const name = (d: EmailDraft) => `${d.lead.firstName} ${d.lead.lastName}`.trim() || d.lead.email || "Unnamed lead"

export function FeedbackView() {
  return (
    <>
      <PageHeader
        title="Feedback"
        description="Find an email, rate what worked, and use your feedback to improve the next draft."
      />
      <div className="space-y-4 px-4 pb-10 md:px-8">
        <WorkspaceGate>{(wsId) => <Feedback key={wsId} wsId={wsId} />}</WorkspaceGate>
      </div>
    </>
  )
}

function Feedback({ wsId }: { wsId: string }) {
  const router = useRouter()
  const icps = useApi(() => fetchIcps(wsId), [wsId])
  const [icpId, setIcpId] = useState("all")
  const [filter, setFilter] = useState("unrated")
  const [openId, setOpenId] = useState<string | null>(null)
  const [openOrder, setOpenOrder] = useState<string[]>([])
  const [improving, setImproving] = useState<ApiIcp | null>(null)
  const [busy, setBusy] = useState("")
  const [query, setQuery] = useState("")
  const [icpQuery, setIcpQuery] = useState("")
  const [hookFilter, setHookFilter] = useState("all")
  const [tagFilter, setTagFilter] = useState("all")
  const [scoreFilter, setScoreFilter] = useState("all")
  const [sort, setSort] = useState("newest")
  const [view, setView] = useState("list")
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  // Goes up after a rating, so the page, its counts and the open email are read again.
  const [version, setVersion] = useState(0)
  const reload = () => setVersion((v) => v + 1)
  // The server filters, sorts, counts and pages (its search also matches tag labels and ICP names, as before).
  const typedQuery = useDebounced(query)
  const filters: EmailListFilters = useMemo(() => ({
    icp: icpId === "all" ? undefined : icpId, terms: typedQuery, hook: hookFilter === "all" ? undefined : hookFilter, tag: tagFilter,
    scoreBand: scoreFilter, rated: filter, sort,
  }), [icpId, typedQuery, hookFilter, tagFilter, scoreFilter, filter, sort])  // prettier-ignore
  const emails = useApi(() => fetchEmailsPage(wsId, filters, page, pageSize), [wsId, filters, page, pageSize, version])
  // How many emails there are and how many are rated: in the workspace, and in the ICP picked.
  const rated = useApi(() => fetchRated(wsId), [wsId, version])
  const oneIcp = icpId !== "all" && icpId !== "none"
  const ratedIcp = useApi(() => (oneIcp ? fetchRated(wsId, icpId) : Promise.resolve(null)), [wsId, icpId, version])
  // The open email is read on its own, so it stays open after it's rated.
  const opened = useApi(() => (openId ? fetchEmail(wsId, openId) : Promise.resolve(null)), [wsId, openId, version])

  if (emails.error && !emails.data) return <BackendError message={emails.error} onRetry={emails.reload} />
  if (!emails.data) return <TableSkeleton rows={6} />

  const icpName = new Map((icps.data ?? []).map((i) => [i.id, i.name]))
  const shown = emails.data.items
  const total = emails.data.total
  const ratings = emails.data.ratings
  const currentPage = page
  if (!shown.length && total > 0 && page > 1) setPage(Math.max(1, Math.ceil(total / pageSize)))
  const hasFilters = !!query || icpId !== "all" || hookFilter !== "all" || tagFilter !== "all" || scoreFilter !== "all" || filter !== "unrated"
  const extraFilters = Number(hookFilter !== "all") + Number(tagFilter !== "all") + Number(scoreFilter !== "all")
  const resetFilters = () => { setQuery(""); setIcpId("all"); setIcpQuery(""); setHookFilter("all"); setTagFilter("all"); setScoreFilter("all"); setFilter("unrated"); setPage(1) }
  const navigationIds = openOrder
  const openIndex = navigationIds.indexOf(openId ?? "")
  const openEmail = (id: string) => {
    setOpenId(id)
    setOpenOrder(shown.map((d) => d.id))
    // Previous and next step through every match, on every page, in this order.
    void fetchEmailIds(wsId, filters).then(setOpenOrder).catch(() => {})
  }
  const fromPage = shown.find((d) => d.id === openId)
  const open = openId ? (opened.data?.id === openId ? opened.data : (fromPage ?? null)) : null
  const activeIcp = icps.data?.find((i) => i.id === icpId)
  const ratedForIcp = ratedIcp.data?.rated ?? 0

  const saveAsExample = async (d: EmailDraft) => {
    setBusy(`example-${d.id}`)
    try {
      await saveEmailAsExample(wsId, d.id)
      toast.success("Saved as an example email", {
        description: "It's on the Example emails page, linked to this lead's ICP.",
        action: { label: "Open", onClick: () => router.push("/examples") },
      })
    } catch (e) {
      toast.error("Couldn't save it", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy("")
    }
  }

  // One-click rating from the list keeps any tags and note already given.
  const quickRate = async (d: EmailDraft, rating: "good" | "bad") => {
    setBusy(d.id)
    try {
      const keep = d.feedback?.rating === rating
      await rateEmail(wsId, d.id, { rating, tags: keep ? d.feedback!.tags : [], note: keep ? d.feedback!.note : "" })
      toast.success(rating === "good" ? "Marked good" : "Marked bad")
      reload()
    } catch (e) {
      toast.error("Couldn't save the rating", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy("")
    }
  }

  if (rated.data?.total === 0)
    return (
      <EmptyState
        icon={MessageSquareText}
        title="No emails to rate yet"
        description="Emails show up here once Claude writes them. Pick leads on the People page and choose Write emails."
        action={
          <Button asChild variant="outline">
            <Link href="/people">Go to People</Link>
          </Button>
        }
      />
    )

  return (
    <>
      <ListTools wsId={wsId} scope="feedback" filters={{ query, icpId, filter, hook: hookFilter, tag: tagFilter, score: scoreFilter, sort, view }}
        onApply={(v) => { setQuery(v.query ?? ""); setIcpId(v.icpId ?? "all"); setFilter(FILTERS.some((f) => f.value === v.filter) ? v.filter : "unrated"); setHookFilter(["all", "with", "without"].includes(v.hook) ? v.hook : "all"); setTagFilter(v.tag in TAG_LABEL ? v.tag : "all"); setScoreFilter(["all", "low", "medium", "high", "unscored"].includes(v.score) ? v.score : "all"); setSort(["newest", "oldest", "rated", "score-low", "score-high"].includes(v.sort) ? v.sort : "newest"); setView(v.view === "cards" ? "cards" : "list"); setPage(1) }} onRefresh={reload} />
      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-medium">Feedback library</p>
            <p className="text-xs text-muted-foreground">Open any email to read it in full, add notes, or save it as an example.</p></div>
          <p className="text-sm tabular-nums text-muted-foreground">{rated.data ? `${rated.data.rated} of ${rated.data.total} rated` : ""}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search feedback" placeholder="Search people, companies, subjects, email text or notes..."
            className="pl-9 pr-9" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} />
          {query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); setPage(1) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground focus-visible:outline-2"><X className="size-4" /></button>}
        </div>
        <Select value={icpId} onValueChange={(value) => { setIcpId(value); setPage(1) }}>
          <SelectTrigger aria-label="ICP" className="w-60!">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <div className="p-2"><Input aria-label="Search ICP filters" placeholder="Find an ICP..." value={icpQuery}
              onChange={(e) => setIcpQuery(e.target.value)} onKeyDown={(e) => { if (e.key !== "Escape") e.stopPropagation() }} /></div>
            <SelectItem value="all">All ICPs</SelectItem>
            <SelectItem value="none">No ICP</SelectItem>
            {(icps.data ?? []).filter((i) => i.name.toLowerCase().includes(icpQuery.trim().toLowerCase())).map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
          <SlidersHorizontal /> Filters{extraFilters ? ` (${extraFilters})` : ""}
        </Button>
        {hasFilters && <Button variant="ghost" onClick={resetFilters}><X /> Reset</Button>}
      </div>
      {icps.error && <p role="alert" className="text-sm text-destructive">Could not load ICPs. <button className="underline" onClick={icps.reload}>Retry</button></p>}
      {showFilters && <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-3">
        <div className="space-y-1.5"><p className="text-xs text-muted-foreground">Personalization</p>
          <Select value={hookFilter} onValueChange={(v) => { setHookFilter(v); setPage(1) }}>
            <SelectTrigger className="w-full" aria-label="Filter by hook"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Any hook</SelectItem><SelectItem value="with">Has a post hook</SelectItem><SelectItem value="without">No post hook</SelectItem></SelectContent>
          </Select></div>
        <div className="space-y-1.5"><p className="text-xs text-muted-foreground">Feedback reason</p>
          <Select value={tagFilter} onValueChange={(v) => { setTagFilter(v); setFilter("all"); setPage(1) }}>
            <SelectTrigger className="w-full" aria-label="Filter by feedback reason"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Any reason</SelectItem>{Object.entries(TAG_LABEL).map(([tag, label]) => <SelectItem key={tag} value={tag}>{label}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="space-y-1.5"><p className="text-xs text-muted-foreground">Email score</p>
          <Select value={scoreFilter} onValueChange={(v) => { setScoreFilter(v); setPage(1) }}>
            <SelectTrigger className="w-full" aria-label="Filter by email score"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Any score</SelectItem><SelectItem value="low">Below 60</SelectItem><SelectItem value="medium">60-79</SelectItem><SelectItem value="high">80 and above</SelectItem><SelectItem value="unscored">Not scored</SelectItem></SelectContent>
          </Select></div>
      </div>}
      <div role="group" aria-label="Filter by rating" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => { setFilter(f.value); setPage(1) }}
            className={cn(
              "flex min-h-20 items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              filter === f.value ? "border-data bg-data/10 font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <span>{f.label}</span><span className="text-2xl font-semibold tabular-nums">{f.count(ratings)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-muted-foreground">{total} matching {total === 1 ? "email" : "emails"}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1) }}>
            <SelectTrigger className="w-48" aria-label="Sort feedback"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="newest">Newest first</SelectItem><SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="score-low">Lowest score first</SelectItem><SelectItem value="score-high">Highest score first</SelectItem><SelectItem value="rated">Recently rated</SelectItem></SelectContent>
          </Select>
          <div role="group" aria-label="Feedback layout" className="flex gap-1">
            <Button variant={view === "list" ? "secondary" : "ghost"} size="icon" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")}><List /></Button>
            <Button variant={view === "cards" ? "secondary" : "ghost"} size="icon" aria-label="Card view" aria-pressed={view === "cards"} onClick={() => setView("cards")}><LayoutGrid /></Button>
          </div>
        </div>
      </div>
      {total === 0 ? (
        <EmptyState icon={MessageSquareText} title="No matching emails" description="Try a different search, rating, or ICP."
          action={<Button variant="outline" onClick={resetFilters}>Reset filters</Button>} />
      ) : view === "list" ? (
        <div className="overflow-hidden rounded-lg border">
          <Table><TableHeader><TableRow><TableHead>Email / recipient</TableHead><TableHead>ICP</TableHead><TableHead>Score</TableHead><TableHead>Feedback</TableHead><TableHead>Written</TableHead><TableHead className="text-right">Rate</TableHead></TableRow></TableHeader>
          <TableBody>{shown.map((d) => <TableRow key={d.id}>
            <TableCell className="max-w-80"><button type="button" className="block max-w-full rounded-sm text-left focus-visible:outline-2" onClick={() => openEmail(d.id)}>
              <span className="block truncate font-medium hover:underline">{d.subject || "Untitled email"}</span>
              <span className="block truncate text-xs text-muted-foreground">{name(d)}{d.lead.company ? ` at ${d.lead.company}` : ""}</span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">{d.body}</span>
            </button></TableCell>
            <TableCell className="max-w-40 truncate text-xs text-muted-foreground">{d.lead.icpId ? icpName.get(d.lead.icpId) ?? "Unknown ICP" : "No ICP"}</TableCell>
            <TableCell className="tabular-nums">{d.score ?? "Not scored"}</TableCell>
            <TableCell><button type="button" className="rounded-sm text-left focus-visible:outline-2" onClick={() => openEmail(d.id)}>
              <Pill tone={d.feedback?.rating === "good" ? "positive" : d.feedback ? "negative" : "neutral"}>{d.feedback?.rating === "good" ? "Good" : d.feedback ? "Bad" : "Not rated"}</Pill>
              {d.feedback?.note && <span className="mt-1 block max-w-44 truncate text-xs text-muted-foreground">{d.feedback.note}</span>}
            </button></TableCell>
            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{shortDate(d.createdAt)}</TableCell>
            <TableCell><div className="flex justify-end gap-1">
              <Button size="icon-sm" variant="outline" aria-label={`Mark ${d.subject} good`} aria-pressed={d.feedback?.rating === "good"} disabled={!!busy}
                className={cn(d.feedback?.rating === "good" && "border-positive text-positive")} onClick={() => void quickRate(d, "good")}><ThumbsUp /></Button>
              <Button size="icon-sm" variant="outline" aria-label={`Mark ${d.subject} bad`} aria-pressed={d.feedback?.rating === "bad"} disabled={!!busy}
                className={cn(d.feedback?.rating === "bad" && "border-negative text-negative")} onClick={() => void quickRate(d, "bad")}><ThumbsDown /></Button>
            </div></TableCell>
          </TableRow>)}</TableBody></Table>
        </div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {shown.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <button type="button" className="min-w-0 text-left" onClick={() => openEmail(d.id)}>
                  <p className="truncate text-sm font-medium hover:underline">{d.subject}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    To {name(d)}
                    {d.lead.company ? ` at ${d.lead.company}` : ""}
                    {d.lead.icpId && icpId === "all" ? ` · ${icpName.get(d.lead.icpId) ?? "ICP"}` : ""} · {shortDate(d.createdAt)}
                  </p>
                </button>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label="Good"
                    aria-pressed={d.feedback?.rating === "good"}
                    disabled={!!busy}
                    className={cn(d.feedback?.rating === "good" && "border-positive bg-positive/10 text-positive")}
                    onClick={() => void quickRate(d, "good")}
                  >
                    <ThumbsUp />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label="Bad"
                    aria-pressed={d.feedback?.rating === "bad"}
                    disabled={!!busy}
                    className={cn(d.feedback?.rating === "bad" && "border-negative bg-negative/10 text-negative")}
                    onClick={() => void quickRate(d, "bad")}
                  >
                    <ThumbsDown />
                  </Button>
                </div>
              </div>
              <p className="line-clamp-4 text-[13px] leading-relaxed whitespace-pre-wrap">{d.body}</p>
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                {d.hook ? <Pill tone="info">Hook from a post</Pill> : <Pill>No hook</Pill>}
                {d.feedback?.tags.map((t) => (
                  <Pill key={t} tone={d.feedback!.rating === "good" ? "positive" : "negative"}>
                    {TAG_LABEL[t]}
                  </Pill>
                ))}
                {d.feedback?.note && <span className="truncate text-xs text-muted-foreground">“{d.feedback.note}”</span>}
                <button type="button" className="ml-auto text-xs text-data hover:underline" onClick={() => openEmail(d.id)}>
                  {d.feedback ? "Edit feedback" : "Add feedback"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {total > 0 && <Pager page={currentPage} pageSize={pageSize} total={total} onPage={setPage}
        onPageSize={(size) => { setPageSize(size); setPage(1) }} />}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
        <div><p className="text-sm font-medium">Improve future emails</p>
          <p className="text-xs text-muted-foreground">{activeIcp ? `Using ${ratedForIcp} ratings for ${activeIcp.name}.` : "Choose one ICP to improve its email prompt."}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {activeIcp && ratedForIcp < MIN_RATED && (
            <span className="text-xs text-muted-foreground">Rate {MIN_RATED - ratedForIcp} more to improve the prompt</span>
          )}
          <ManagerOnly><Button
            variant="outline"
            disabled={!activeIcp || ratedForIcp < MIN_RATED}
            title={!activeIcp ? "Pick an ICP first" : undefined}
            onClick={() => activeIcp && setImproving(activeIcp)}
          >
            <Sparkles /> Improve email prompt
          </Button></ManagerOnly>
        </div>
      </div>

      {open && (
        <Sheet open onOpenChange={(o) => !o && setOpenId(null)}>
          <SheetContent className="w-full! gap-0 overflow-y-auto sm:max-w-xl!">
            <div className="flex items-center justify-between gap-2 border-b px-5 py-3 pr-12">
              <span className="text-xs text-muted-foreground">{openIndex >= 0 ? `${openIndex + 1} of ${navigationIds.length} emails in this session` : "Email feedback"}</span>
              <div className="flex gap-1">
                <Button size="icon-sm" variant="outline" aria-label="Previous feedback email" disabled={openIndex <= 0 || !!busy}
                  onClick={() => setOpenId(navigationIds[openIndex - 1])}><ArrowLeft /></Button>
                <Button size="icon-sm" variant="outline" aria-label="Next feedback email" disabled={openIndex < 0 || openIndex >= navigationIds.length - 1 || !!busy}
                  onClick={() => setOpenId(navigationIds[openIndex + 1])}><ArrowRight /></Button>
              </div>
            </div>
            <SheetHeader className="px-5 pt-5 pb-4">
              <SheetTitle className="text-lg">{open.subject}</SheetTitle>
              <SheetDescription>
                To {name(open)}
                {open.lead.title ? `, ${open.lead.title}` : ""}
                {open.lead.company ? ` at ${open.lead.company}` : ""}
                {open.examplesUsed ? ` · written with ${open.examplesUsed} rated examples` : ""}
              </SheetDescription>
            </SheetHeader>
            <section className="space-y-2 border-t border-rule px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{open.lead.email ?? "No email address"} / {shortDate(open.createdAt)}</span>
                <Link className="text-data hover:underline" href={`/review?email=${encodeURIComponent(open.id)}`}>Open in Review</Link>
              </div>
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{open.body}</p>
              {open.edited && <p className="text-xs text-muted-foreground">This is the edited version; Claude&apos;s original is kept.</p>}
            </section>
            {open.hook && (
              <section className="space-y-1 border-t border-rule px-5 py-4 text-[13px]">
                <p>
                  <span className="font-medium">Hook:</span> {open.hook}
                </p>
                {open.chosenPost && (
                  <a href={open.chosenPost.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                    From {open.chosenPost.whose === "person" ? "their" : "their company's"} {open.chosenPost.source} post{" "}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </section>
            )}
            <section className="space-y-2 border-t border-rule px-5 py-4">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Your feedback</h3>
              <FeedbackControl key={open.id + (open.feedback?.updatedAt ?? "")} workspaceId={wsId} draft={open} onSaved={() => reload()} />
            </section>
            <section className="space-y-2 border-t border-rule px-5 py-4">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Example emails</h3>
              <p className="text-xs text-muted-foreground">
                Copy this email{open.edited ? ", with your edits," : ""} into the example library for its ICP. Claude writes like it from
                then on.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={!open.lead.icpId || busy === `example-${open.id}`}
                title={!open.lead.icpId ? "This lead has no ICP to link the example to" : undefined}
                onClick={() => void saveAsExample(open)}
              >
                <Mail /> {busy === `example-${open.id}` ? "Saving…" : "Save as example"}
              </Button>
            </section>
          </SheetContent>
        </Sheet>
      )}

      {improving && <ImproveDialog wsId={wsId} icp={improving} onClose={() => setImproving(null)} />}
    </>
  )
}

/** Claude's suggested rewrite of the ICP's email prompt, from the feedback. Saved only if you choose to. */
function ImproveDialog({ wsId, icp, onClose }: { wsId: string; icp: ApiIcp; onClose: () => void }) {
  const { versions, templates, saveVersion } = useStore()
  const [suggestion, setSuggestion] = useState<PromptSuggestion | null>(null)
  const [state, setState] = useState<"idle" | "asking" | "saving">("idle")
  const [failure, setFailure] = useState("")

  const ask = async () => {
    setState("asking")
    setFailure("")
    try {
      setSuggestion(await suggestEmailPrompt(wsId, icp.id))
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Claude couldn't suggest a prompt.")
    } finally {
      setState("idle")
    }
  }

  const save = async () => {
    if (!suggestion) return
    const template = templates.find((t) => t.id === suggestion.promptId)
    const current = versions.find((v) => v.id === template?.currentVersionId)
    if (!current) {
      toast.error("Reload the page and try again: the prompt isn't loaded")
      return
    }
    setState("saving")
    try {
      const v = await saveVersion(
        suggestion.promptId,
        { systemPrompt: suggestion.systemPrompt, userPrompt: suggestion.userPrompt, model: current.model, temperature: current.temperature, maxTokens: current.maxTokens, maxPosts: current.maxPosts },
        `Improved from feedback on ${suggestion.examples} rated emails: ${suggestion.summary}`.slice(0, 500),
      )
      toast.success(`Saved ${suggestion.promptName} v${v.version}`)
      onClose()
    } catch (e) {
      toast.error("Couldn't save it", { description: e instanceof Error ? e.message : undefined })
      setState("idle")
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && state === "idle" && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl!">
        <DialogHeader>
          <DialogTitle>Improve the email prompt for {icp.name}</DialogTitle>
          <DialogDescription>
            Claude (Sonnet 5.5) reads the prompt this ICP uses and your latest ratings, then suggests a revised prompt. Nothing changes
            until you save it.
          </DialogDescription>
        </DialogHeader>

        {failure && <p className="text-sm text-destructive">{failure}</p>}

        {suggestion ? (
          <div className="space-y-4">
            <div className="space-y-1 text-sm">
              <p className="font-medium">{suggestion.summary}</p>
              {suggestion.changes.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
                  {suggestion.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground tabular-nums">
                From {suggestion.examples} rated emails, based on {suggestion.promptName} v{suggestion.basedOnVersion} · Claude cost{" "}
                {formatUsd(suggestion.costUsd)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Suggested system prompt</p>
              <pre className="max-h-40 overflow-y-auto rounded-md bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap">{suggestion.systemPrompt}</pre>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Suggested prompt</p>
              <pre className="max-h-72 overflow-y-auto rounded-md bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap">{suggestion.userPrompt}</pre>
            </div>
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[13px]">
              Saving adds v{suggestion.basedOnVersion + 1} to {suggestion.promptName}, and it&apos;s used from then on by
              {suggestion.isDefault ? " every ICP set to “Use default”" : ""}
              {suggestion.isDefault && suggestion.chosenByIcps ? " and" : ""}
              {suggestion.chosenByIcps ? ` ${suggestion.chosenByIcps} ICP${suggestion.chosenByIcps === 1 ? "" : "s"} that chose it` : ""}
              {!suggestion.isDefault && !suggestion.chosenByIcps ? " the ICPs that use it" : ""}. To change only {icp.name}, open the
              prompt, duplicate it and pick the copy on the ICP&apos;s Prompts tab.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {state === "asking" ? "Claude is reading your feedback… this can take a minute." : "Uses a few cents of Claude credit."}
          </p>
        )}

        <DialogFooter>
          {suggestion && (
            <Button variant="ghost" asChild>
              <Link href={`/prompts/${suggestion.promptId}`}>Open the prompt</Link>
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={state !== "idle"}>
            {suggestion ? "Discard" : "Cancel"}
          </Button>
          {suggestion ? (
            <Button onClick={() => void save()} disabled={state !== "idle"}>
              {state === "saving" ? "Saving…" : `Save as v${suggestion.basedOnVersion + 1}`}
            </Button>
          ) : (
            <Button onClick={() => void ask()} disabled={state !== "idle"}>
              <Sparkles /> {state === "asking" ? "Asking Claude…" : "Suggest a better prompt"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
