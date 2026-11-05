"use client"

import { FacetFilters } from "@/components/facet-filters"
import { presenceMatches, recentMatches, scoreMatches, PRESENCE_OPTIONS, RECENT_OPTIONS, SCORE_OPTIONS } from "@/lib/facets"
import { useEffect, useState } from "react"
import { ArrowRightLeft, Search, Sparkles, Trash2, Users, Wand2 } from "lucide-react"
import { toast } from "sonner"
import { AddLeadsMenu } from "@/components/add-leads"
import { BackendError } from "@/components/companies/backend-state"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { LeadsTable } from "@/components/leads-table"
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
import { LEAD_STATUS_LABEL, SOURCE_LABEL, fullName, leadSources } from "@/lib/format"
import { useStore } from "@/lib/store"
import { LEAD_STATUSES, SOURCES } from "@/lib/types"

/** An email the source checked: Apollo's "verified" or the LinkedIn search's "valid". */
const isVerified = (l: { email: string; emailStatus: string | null }) =>
  !!l.email && ["verified", "valid"].includes((l.emailStatus ?? "").toLowerCase())

export default function LeadsPage() {
  const { leads: everyone, leadsStatus, leadsError, reloadLeads, icps, moveLeads, deleteLeads } = useStore()
  // Someone is a lead once their first email is queued for sending; before that they're worked on from People.
  const leads = everyone.filter((l) => l.queuedAt)
  const loading = leadsStatus === "loading"
  // Leads are also made on the People and Companies pages, so fetch a fresh list on every visit.
  useEffect(() => reloadLeads(), [reloadLeads])
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState("")
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [icpFilter, setIcpFilter] = useState("all")
  const [status, setStatus] = useState("all")
  const [source, setSource] = useState("all")
  const [emailFilter, setEmailFilter] = useState("all")
  const [removingNoEmail, setRemovingNoEmail] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveTarget, setMoveTarget] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [run, setRun] = useState<"posts" | "emails" | null>(null)

  const q = query.trim().toLowerCase()
  const visible = leads.filter((l) => {
    const sources = leadSources(l)
    return (
      presenceMatches(l.linkedinUrl, extra.linkedin) &&
      presenceMatches(l.postCount, extra.posts) &&
      scoreMatches(l.score?.value, extra.score) &&
      recentMatches(l.queuedAt, extra.queued) &&
      (icpFilter === "all" || l.icpId === icpFilter) &&
      (status === "all" || l.status === status) &&
      (source === "all" ||
        (source === "none" ? sources.every((s) => s === "website") : sources.includes(source as (typeof SOURCES)[number]))) &&
      (emailFilter === "all" || (emailFilter === "none" ? !l.email : emailFilter === "verified" ? isVerified(l) : !!l.email)) &&
      (!q || `${fullName(l)} ${l.email} ${l.company} ${l.title}`.toLowerCase().includes(q))
    )
  })
  const filtered = Object.values(extra).some((v) => v && v !== "all") || query || icpFilter !== "all" || status !== "all" || source !== "all" || emailFilter !== "all"
  const noEmail = leads.filter((l) => !l.email)
  const allShownPicked = visible.length > 0 && visible.every((l) => selected.has(l.id))
  const ids = Array.from(selected)
  // Posts and emails follow an ICP's sources and prompts, so they run for leads of one ICP at a time.
  const selectedIcpIds = new Set(leads.filter((l) => selected.has(l.id)).map((l) => l.icpId))
  const runIcp = selectedIcpIds.size === 1 ? icps.find((i) => i.id === [...selectedIcpIds][0]) : undefined
  const runHint = ids.length === 0 ? "Select leads first" : runIcp ? undefined : "Select leads from one ICP"

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
        description={`${leads.length} leads across ${icps.length} ICPs`}
        actions={<AddLeadsMenu variant="default" />}
      />
      <div className="space-y-4 px-4 pb-10 md:px-8">
        <FacetFilters values={extra} onChange={setExtra} count={visible.length} fields={[
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
          {visible.length > 0 && (
            <Button
              variant="ghost"
              onClick={() => setSelected(allShownPicked ? new Set() : new Set(visible.map((l) => l.id)))}
            >
              {allShownPicked ? "Clear selection" : `Select all ${visible.length.toLocaleString()}${filtered ? " matching" : ""}`}
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
            <ManagerOnly><Button variant="outline" disabled={noEmail.length === 0} onClick={() => setRemovingNoEmail(true)}>
              <Trash2 /> Remove {noEmail.length.toLocaleString()} without email
            </Button></ManagerOnly>
            <ManagerOnly><Button variant="destructive" disabled={ids.length === 0} onClick={() => setDeleteOpen(true)}>
              <Trash2 /> Delete{ids.length ? ` (${ids.length})` : ""}
            </Button></ManagerOnly>
          </div>
        </div>

        {leadsStatus === "error" ? (
          <BackendError message={leadsError ?? ""} onRetry={reloadLeads} />
        ) : loading ? (
          <TableSkeleton />
        ) : leads.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No leads yet"
            description="Someone becomes a lead once their first email is queued for sending. Find people, write their emails on the People page, approve them in Review, then queue them."
            action={<AddLeadsMenu variant="default" />}
          />
        ) : visible.length === 0 ? (
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
          <LeadsTable leads={visible} selected={selected} onSelectedChange={setSelected} showIcp />
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
                  setSelected(new Set())
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
        title={`Remove ${noEmail.length.toLocaleString()} lead${noEmail.length === 1 ? "" : "s"} without an email?`}
        description="Every lead with no email address, in every ICP. Their posts, hooks and drafts are deleted too; the people they came from stay on the People page, so you can reveal an email and add them again. This can't be undone."
        confirmLabel={`Remove ${noEmail.length.toLocaleString()}`}
        onConfirm={async () => {
          const gone = noEmail.map((l) => l.id)
          try {
            for (let i = 0; i < gone.length; i += 1000) await deleteLeads(gone.slice(i, i + 1000))
            setSelected((s) => new Set([...s].filter((id) => !gone.includes(id))))
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
            setSelected(new Set())
            toast.success(`Deleted ${ids.length} lead${ids.length === 1 ? "" : "s"}`)
          } catch (e) {
            toast.error("Couldn't delete them", { description: e instanceof Error ? e.message : undefined })
          }
        }}
      />
    </>
  )
}
