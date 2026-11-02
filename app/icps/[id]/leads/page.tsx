"use client"

import { useEffect, useState } from "react"
import { Search, Sparkles, Users, Wand2 } from "lucide-react"
import { AddLeadsMenu } from "@/components/add-leads"
import { EmptyState } from "@/components/empty-state"
import { LeadsTable } from "@/components/leads-table"
import { ManagerOnly } from "@/components/manager-only"
import { EnrichDialog, GenerateDialog } from "@/components/run-dialogs"
import { TableSkeleton } from "@/components/table-skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useIcpParam } from "@/hooks/use-icp"
import { LEAD_STATUS_LABEL, fullName } from "@/lib/format"
import { ENRICHABLE, GENERATABLE } from "@/lib/selectors"
import { useStore } from "@/lib/store"
import { LEAD_STATUSES } from "@/lib/types"

export default function IcpLeadsPage() {
  const icp = useIcpParam()
  const { leads, leadsStatus, reloadLeads } = useStore()
  // Leads are also made on the People and Companies pages, so fetch a fresh list on every visit.
  useEffect(() => reloadLeads(), [reloadLeads])
  const loading = leadsStatus === "loading"
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [enrichIds, setEnrichIds] = useState<string[] | null>(null)
  const [generateIds, setGenerateIds] = useState<string[] | null>(null)
  if (!icp) return null

  const icpLeads = leads.filter((l) => l.icpId === icp.id)
  const q = query.trim().toLowerCase()
  const visible = icpLeads.filter(
    (l) =>
      (status === "all" || l.status === status) &&
      (!q || `${fullName(l)} ${l.email} ${l.company}`.toLowerCase().includes(q)),
  )
  const selectedLeads = icpLeads.filter((l) => selected.has(l.id))

  const enrichAll = icpLeads.filter((l) => ENRICHABLE.includes(l.status)).map((l) => l.id)
  const enrichSelected = selectedLeads.map((l) => l.id)
  const generateTargets = (selected.size ? selectedLeads : icpLeads.filter((l) => l.status === "enriched" || l.status === "no_content"))
    .filter((l) => GENERATABLE.includes(l.status))
    .map((l) => l.id)

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
          <ManagerOnly><Button variant="outline" disabled={enrichAll.length === 0} onClick={() => setEnrichIds(enrichAll)}>
            Fetch posts for all new ({enrichAll.length})
          </Button></ManagerOnly>
          <ManagerOnly><Button disabled={generateTargets.length === 0} onClick={() => setGenerateIds(generateTargets)}>
            <Wand2 /> Write emails ({generateTargets.length})
          </Button></ManagerOnly>
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : icpLeads.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No leads in this ICP"
          description="Add people as leads on the People page, import a CSV, or add them one by one. Nothing is spent until you fetch posts or write emails."
          action={<AddLeadsMenu icpId={icp.id} variant="default" />}
        />
      ) : visible.length === 0 ? (
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
        <LeadsTable leads={visible} selected={selected} onSelectedChange={setSelected} />
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
