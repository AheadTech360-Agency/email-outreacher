"use client"

import { FacetFilters } from "@/components/facet-filters"
import { PRESENCE_OPTIONS, RECENT_OPTIONS, SCORE_OPTIONS } from "@/lib/facets"
import { useMemo, useState } from "react"
import { type LeadFilters, fetchLeadsPage, fetchMatchingLeads } from "@/lib/lists"
import { useDebounced } from "@/lib/use-debounced"
import { useApi } from "@/lib/api"
import { ArrowRightLeft, Search, Sparkles, Trash2, Users, Wand2 } from "lucide-react"
import { toast } from "sonner"
import { AddLeadsMenu } from "@/components/add-leads"
import { BackendError } from "@/components/companies/backend-state"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { LEADS_PAGE_SIZE, LeadsTable } from "@/components/leads-table"
import { ManagerOnly } from "@/components/manager-only"
import { PageHeader } from "@/components/page-header"
import { EnrichDialog, GenerateDialog } from "@/components/run-dialogs"
import { TableSkeleton } from "@/components/table-skeleton"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LEAD_STATUS_LABEL, SOURCE_LABEL } from "@/lib/format"
import { useStore } from "@/lib/store"
import { LEAD_STATUSES, SOURCES } from "@/lib/types"

export default function LeadsPage() {
  const { leadsVersion, currentWorkspaceId, icps, moveLeads, deleteLeads } = useStore()
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState("")
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [icpFilter, setIcpFilter] = useState("all")
  const [status, setStatus] = useState("all")
  const [source, setSource] = useState("all")
  const [emailFilter, setEmailFilter] = useState("all")
  const [removingNoEmail, setRemovingNoEmail] = useState(false)
  // Picked leads and their ICP (posts and emails run for one ICP at a time): kept across pages.
  const [selected, setSelected] = useState<Map<string, string>>(new Map())
  const [page, setPage] = useState(0)
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveTarget, setMoveTarget] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [run, setRun] = useState<"posts" | "emails" | null>(null)

  // Someone is a lead once their first email is queued for sending (the server lists only them); the server filters
  // and pages, and typing waits for a pause before it asks.
  const typedQuery = useDebounced(query)
  const filters: LeadFilters = useMemo(() => ({
    icpId: icpFilter === "all" ? undefined : icpFilter, status, source, email: emailFilter, linkedin: extra.linkedin, posts: extra.posts,
    score: extra.score, queuedWithin: extra.queued, q: typedQuery,
  }), [icpFilter, status, source, emailFilter, extra.linkedin, extra.posts, extra.score, extra.queued, typedQuery])  // prettier-ignore
  // Back to the first page whenever the filters change.
  const [pageOf, setPageOf] = useState(filters)
  if (pageOf !== filters) {
    setPageOf(filters)
    setPage(0)
  }
  const result = useApi(
    () => (currentWorkspaceId ? fetchLeadsPage(currentWorkspaceId, filters, page + 1, LEADS_PAGE_SIZE) : Promise.resolve(null)),
    [currentWorkspaceId, filters, page, leadsVersion],
  )
  const shown = result.data?.items ?? []
  const total = result.data?.total ?? 0
  const queuedTotal = result.data?.queuedTotal ?? 0
  const noEmailCount = result.data?.noEmail ?? 0
  if (result.data && !shown.length && total > 0 && page > 0) setPage(Math.max(0, Math.ceil(total / LEADS_PAGE_SIZE) - 1))
  const filtered = Object.values(extra).some((v) => v && v !== "all") || query || icpFilter !== "all" || status !== "all" || source !== "all" || emailFilter !== "all"
  const allShownPicked = total > 0 && selected.size >= total && shown.every((l) => selected.has(l.id))
  const ids = Array.from(selected.keys())
  // Posts and emails follow an ICP's sources and prompts, so they run for leads of one ICP at a time.
  const selectedIcpIds = new Set(selected.values())
  const runIcp = selectedIcpIds.size === 1 ? icps.find((i) => i.id === [...selectedIcpIds][0]) : undefined
  const runHint = ids.length === 0 ? "Select leads first" : runIcp ? undefined : "Select leads from one ICP"

  const pickAll = async () => {
    if (!currentWorkspaceId) return
    try {
      const all = await fetchMatchingLeads(currentWorkspaceId, filters)
      setSelected(new Map(all.map((l) => [l.id, l.icpId ?? ""])))
    } catch (e) {
      toast.error("Couldn't select them", { description: e instanceof Error ? e.message : undefined })
    }
  }

  const clear = () => {
    setExtra({})
    setQuery("")
    setIcpFilter("all")
    setStatus("all")
    setSource("all")
    setEmailFilter("all")
  }

  return (
    <>
      <PageHeader
        title="Leads"
        description={`${queuedTotal} leads across ${icps.length} ICPs`}
        actions={<AddLeadsMenu variant="default" />}
      />
      <div className="space-y-4 px-4 pb-10 md:px-8">
        <FacetFilters values={extra} onChange={setExtra} count={total} fields={[
          {key:"linkedin",label:"LinkedIn profile",options:PRESENCE_OPTIONS},
          {key:"posts",label:"Fetched posts",options:PRESENCE_OPTIONS},
          {key:"score",label:"Lead score",options:SCORE_OPTIONS},
          {key:"queued",label:"Queued date",options:RECENT_OPTIONS},
        ]} />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search leads" placeholder="Search leads" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Select value={icpFilter} onValueChange={setIcpFilter}>
            <SelectTrigger aria-label="Filter by ICP" className="w-48!">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ICPs</SelectItem>
              {icps.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Filter by status" className="w-36!">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {LEAD_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger aria-label="Filter by source" className="w-40!">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any source</SelectItem>
              {SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  Has {SOURCE_LABEL[s]}
                </SelectItem>
              ))}
              <SelectItem value="none">No social profiles</SelectItem>
            </SelectContent>
          </Select>
          <Select value={emailFilter} onValueChange={setEmailFilter}>
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
          {total > 0 && (
            <Button
              variant="ghost"
              onClick={() => (allShownPicked ? setSelected(new Map()) : void pickAll())}
            >
              {allShownPicked ? "Clear selection" : `Select all ${total.toLocaleString()}${filtered ? " matching" : ""}`}
            </Button>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <ManagerOnly><Button variant="outline" disabled={!runIcp} title={runHint} onClick={() => setRun("posts")}>
              <Sparkles /> Fetch posts{ids.length ? ` (${ids.length})` : ""}
            </Button></ManagerOnly>
            <ManagerOnly><Button variant="outline" disabled={!runIcp} title={runHint} onClick={() => setRun("emails")}>
              <Wand2 /> Write emails{ids.length ? ` (${ids.length})` : ""}
            </Button></ManagerOnly>
            <ManagerOnly><Button
              variant="outline"
              disabled={ids.length === 0}
              onClick={() => {
                setMoveTarget("")
                setMoveOpen(true)
              }}
            >
              <ArrowRightLeft /> Move{ids.length ? ` (${ids.length})` : ""}
            </Button></ManagerOnly>
            <ManagerOnly><Button variant="outline" disabled={noEmailCount === 0} onClick={() => setRemovingNoEmail(true)}>
              <Trash2 /> Remove {noEmailCount.toLocaleString()} without email
            </Button></ManagerOnly>
            <ManagerOnly><Button variant="destructive" disabled={ids.length === 0} onClick={() => setDeleteOpen(true)}>
              <Trash2 /> Delete{ids.length ? ` (${ids.length})` : ""}
            </Button></ManagerOnly>
          </div>
        </div>

        {result.error && !result.data ? (
          <BackendError message={result.error} onRetry={result.reload} />
        ) : !result.data ? (
          <TableSkeleton />
        ) : queuedTotal === 0 ? (
          <EmptyState
            icon={Users}
            title="No leads yet"
            description="Someone becomes a lead once their first email is queued for sending. Find people, write their emails on the People page, approve them in Review, then queue them."
            action={<AddLeadsMenu variant="default" />}
          />
        ) : total === 0 ? (
          <EmptyState
            icon={Search}
            title="No leads match these filters"
            action={
              filtered && (
                <Button variant="outline" onClick={clear}>
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <LeadsTable leads={shown} total={total} page={page} onPage={setPage} selected={new Set(selected.keys())} showIcp
            onPick={(rows, on) => setSelected((s) => { const next = new Map(s); for (const l of rows) { if (on) next.set(l.id, l.icpId); else next.delete(l.id) } return next })} />
        )}
      </div>

      {run === "posts" && runIcp && (
        <EnrichDialog icp={runIcp} leadIds={ids} open onOpenChange={(o) => !o && setRun(null)} />
      )}
      {run === "emails" && runIcp && (
        <GenerateDialog icp={runIcp} leadIds={ids} open onOpenChange={(o) => !o && setRun(null)} />
      )}

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {ids.length} lead{ids.length === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>
              Leads keep their content and drafts. Future generations use the new ICP&apos;s messaging and prompts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Destination ICP</Label>
            <Select value={moveTarget} onValueChange={setMoveTarget}>
              <SelectTrigger className="w-full!" aria-label="Destination ICP">
                <SelectValue placeholder="Choose an ICP" />
              </SelectTrigger>
              <SelectContent>
                {icps.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!moveTarget || busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await moveLeads(ids, moveTarget)
                  setMoveOpen(false)
                  setSelected(new Map())
                  toast.success(`Moved ${ids.length} lead${ids.length === 1 ? "" : "s"} to ${icps.find((i) => i.id === moveTarget)?.name}`)
                } catch (e) {
                  toast.error("Couldn't move them", { description: e instanceof Error ? e.message : undefined })
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? "Moving…" : "Move leads"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removingNoEmail}
        onOpenChange={setRemovingNoEmail}
        destructive
        title={`Remove ${noEmailCount.toLocaleString()} lead${noEmailCount === 1 ? "" : "s"} without an email?`}
        description="Every lead with no email address, in every ICP. Their posts, hooks and drafts are deleted too; the people they came from stay on the People page, so you can reveal an email and add them again. This can't be undone."
        confirmLabel={`Remove ${noEmailCount.toLocaleString()}`}
        onConfirm={async () => {
          try {
            // Every lead in sequence with no email, in every ICP, whatever the filters (as the button says).
            const gone = currentWorkspaceId ? (await fetchMatchingLeads(currentWorkspaceId, { email: "none" })).map((l) => l.id) : []
            for (let i = 0; i < gone.length; i += 1000) await deleteLeads(gone.slice(i, i + 1000))
            setSelected((s) => new Map([...s].filter(([id]) => !gone.includes(id))))
            toast.success(`Removed ${gone.length.toLocaleString()} lead${gone.length === 1 ? "" : "s"} without an email`)
          } catch (e) {
            toast.error("Couldn't remove them", { description: e instanceof Error ? e.message : undefined })
          }
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        destructive
        title={`Delete ${ids.length} lead${ids.length === 1 ? "" : "s"}?`}
        description="Their posts, hooks, drafts and ratings are deleted too. The people they came from stay on the People page. This can't be undone."
        confirmLabel={`Delete ${ids.length} lead${ids.length === 1 ? "" : "s"}`}
        onConfirm={async () => {
          try {
            await deleteLeads(ids)
            setSelected(new Map())
            toast.success(`Deleted ${ids.length} lead${ids.length === 1 ? "" : "s"}`)
          } catch (e) {
            toast.error("Couldn't delete them", { description: e instanceof Error ? e.message : undefined })
          }
        }}
      />
    </>
  )
}
