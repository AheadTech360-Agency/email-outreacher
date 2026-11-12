"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { SourceIcons } from "@/components/source-icon"
import { LeadStatusBadge, ScoreBadge } from "@/components/status"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fullName, leadSources, shortDate } from "@/lib/format"
import { useStore } from "@/lib/store"
import type { Lead } from "@/lib/types"

export const LEADS_PAGE_SIZE = 20

/** One page of leads (the server pages them): `page` counts from 0; picks are reported with the rows picked. */
export function LeadsTable({
  leads,
  total,
  page,
  onPage,
  selected,
  onPick,
  showIcp,
}: {
  leads: Lead[]
  total: number
  page: number
  onPage: (page: number) => void
  selected: Set<string>
  onPick: (rows: Lead[], on: boolean) => void
  showIcp?: boolean
}) {
  const { icps, settings } = useStore()
  const pageCount = Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE))
  const current = page
  const rows = leads

  const allOnPage = rows.length > 0 && rows.every((l) => selected.has(l.id))
  const someOnPage = rows.some((l) => selected.has(l.id))

  const togglePage = (on: boolean) => onPick(rows, on)

  return (
    <div className="space-y-2">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  aria-label="Select all on this page"
                  checked={allOnPage ? true : someOnPage ? "indeterminate" : false}
                  onCheckedChange={(v) => togglePage(v === true)}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Title</TableHead>
              {showIcp && <TableHead>ICP</TableHead>}
              <TableHead>Sources</TableHead>
              <TableHead className="text-right">Posts</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((lead) => (
              <TableRow key={lead.id} data-state={selected.has(lead.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${fullName(lead)}`}
                    checked={selected.has(lead.id)}
                    onCheckedChange={(v) => onPick([lead], v === true)}
                  />
                </TableCell>
                <TableCell>
                  <div className="font-medium">{fullName(lead)}</div>
                  <div className="text-xs text-muted-foreground">{lead.email}</div>
                </TableCell>
                <TableCell>{lead.company}</TableCell>
                <TableCell className="max-w-48 truncate text-muted-foreground">{lead.title}</TableCell>
                {showIcp && (
                  <TableCell className="max-w-48 truncate text-muted-foreground">
                    {icps.find((i) => i.id === lead.icpId)?.name}
                  </TableCell>
                )}
                <TableCell>
                  <SourceIcons sources={leadSources(lead)} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{lead.postCount}</TableCell>
                <TableCell className="text-right">
                  <ScoreBadge value={lead.score?.value} threshold={settings.scoring.threshold} />
                </TableCell>
                <TableCell>
                  <LeadStatusBadge status={lead.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{shortDate(lead.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {selected.size > 0 && `${selected.size} selected · `}
          {total} lead{total === 1 ? "" : "s"}
        </span>
        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <span className="tabular-nums">
              Page {current + 1} of {pageCount}
            </span>
            <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={current === 0} onClick={() => onPage(current - 1)}>
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={current >= pageCount - 1}
              onClick={() => onPage(current + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
