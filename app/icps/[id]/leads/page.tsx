"use client"

import { useMemo, useState } from "react"
import { Search, Sparkles, Users, Wand2 } from "lucide-react"
import { toast } from "sonner"
import { AddLeadsMenu } from "@/components/add-leads"
import { BackendError } from "@/components/companies/backend-state"
import { EmptyState } from "@/components/empty-state"
import { LEADS_PAGE_SIZE, LeadsTable } from "@/components/leads-table"
import { ManagerOnly } from "@/components/manager-only"
import { EnrichDialog, GenerateDialog } from "@/components/run-dialogs"
import { TableSkeleton } from "@/components/table-skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useIcpParam } from "@/hooks/use-icp"
import { useApi } from "@/lib/api"
import { LEAD_STATUS_LABEL } from "@/lib/format"
import { type LeadFilters, fetchLeadsPage, fetchMatchingLeads } from "@/lib/lists"
import { ENRICHABLE, GENERATABLE, leadCount } from "@/lib/selectors"
import { useStore } from "@/lib/store"
import { LEAD_STATUSES, type LeadStatus } from "@/lib/types"
import { useDebounced } from "@/lib/use-debounced"

const READY: LeadStatus[] = ["enriched", "no_content"]

export default function IcpLeadsPage() {
  const icp = useIcpParam()
  const { leadsVersion, currentWorkspaceId } = useStore()
  // Picked leads and their status (which can be written): kept across pages.
  const [selected, setSelected] = useState<Map<string, LeadStatus>>(new Map())
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [page, setPage] = useState(0)
  const [enrichIds, setEnrichIds] = useState<string[] | null>(null)
  const [generateIds, setGenerateIds] = useState<string[] | null>(null)
  const [finding, setFinding] = useState(false)
  // This ICP's leads (someone is a lead once their email is queued), filtered and paged by the server. The search
  // covers name, email and company, as it always did here.
  const typedQuery = useDebounced(query)
  const filters: LeadFilters = useMemo(
    () => ({ icpId: icp?.id, status, q: typedQuery, qTitle: "false" }),
    [icp?.id, status, typedQuery],
  )
  const [pageOf, setPageOf] = useState(filters)
  if (pageOf !== filters) {
    setPageOf(filters)
    setPage(0)
  }
  const result = useApi(
    () => (currentWorkspaceId && icp ? fetchLeadsPage(currentWorkspaceId, filters, page + 1, LEADS_PAGE_SIZE, icp.id) : Promise.resolve(null)),
    [currentWorkspaceId, icp?.id, filters, page, leadsVersion],
  )
  if (!icp) return null

  const shown = result.data?.items ?? []
  const total = result.data?.total ?? 0
  const statuses = result.data?.statuses ?? {}
  if (result.data && !shown.length && total > 0 && page > 0) setPage(Math.max(0, Math.ceil(total / LEADS_PAGE_SIZE) - 1))

  const enrichSelected = [...selected.keys()]
  const enrichAllCount = leadCount(statuses, ENRICHABLE)
  const writable = [...selected].filter(([, s]) => GENERATABLE.includes(s)).map(([id]) => id)
  const generateCount = selected.size ? writable.length : leadCount(statuses, READY.filter((s) => GENERATABLE.includes(s)))

  // The "all" buttons read every matching lead's id and status only when pressed.
  const every = async (keep: LeadStatus[], then: (ids: string[]) => void) => {
    if (!currentWorkspaceId) return
    setFinding(true)
    try {
      const all = await fetchMatchingLeads(currentWorkspaceId, { icpId: icp.id })
      then(all.filter((l) => keep.includes(l.status)).map((l) => l.id))
    } catch (e) {
      toast.error("Couldn't read the leads", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setFinding(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search leads"
            placeholder="Search name, email, company"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Filter by status" className="w-40!">
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
        <div className="ml-auto flex flex-wrap gap-2">
          <AddLeadsMenu icpId={icp.id} />
          <ManagerOnly><Button variant="outline" disabled={enrichSelected.length === 0} onClick={() => setEnrichIds(enrichSelected)}>
            <Sparkles /> Fetch posts{enrichSelected.length ? ` (${enrichSelected.length})` : ""}
          </Button></ManagerOnly>
          <ManagerOnly><Button variant="outline" disabled={enrichAllCount === 0 || finding} onClick={() => void every(ENRICHABLE, setEnrichIds)}>
            Fetch posts for all new ({enrichAllCount})
          </Button></ManagerOnly>
          <ManagerOnly><Button disabled={generateCount === 0 || finding}
            onClick={() => (selected.size ? setGenerateIds(writable) : void every(READY.filter((s) => GENERATABLE.includes(s)), setGenerateIds))}>
            <Wand2 /> Write emails ({generateCount})
          </Button></ManagerOnly>
        </div>
      </div>

      {result.error && !result.data ? (
        <BackendError message={result.error} onRetry={result.reload} />
      ) : !result.data ? (
        <TableSkeleton />
      ) : result.data.queuedTotal === 0 ? (
        <EmptyState
          icon={Users}
          title="No leads in this ICP"
          description="Someone becomes a lead once their first email is queued for sending, from Review."
          action={<AddLeadsMenu icpId={icp.id} variant="default" />}
        />
      ) : total === 0 ? (
        <EmptyState
          icon={Search}
          title="No leads match these filters"
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQuery("")
                setStatus("all")
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <LeadsTable leads={shown} total={total} page={page} onPage={setPage} selected={new Set(selected.keys())}
          onPick={(rows, on) => setSelected((s) => { const next = new Map(s); for (const l of rows) { if (on) next.set(l.id, l.status); else next.delete(l.id) } return next })} />
      )}

      {enrichIds && (
        <EnrichDialog icp={icp} leadIds={enrichIds} open onOpenChange={(o) => !o && setEnrichIds(null)} />
      )}
      {generateIds && (
        <GenerateDialog icp={icp} leadIds={generateIds} open onOpenChange={(o) => !o && setGenerateIds(null)} />
      )}
    </div>
  )
}
