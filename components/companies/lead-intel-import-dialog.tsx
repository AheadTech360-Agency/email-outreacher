"use client"

import { useState } from "react"
import { Download } from "lucide-react"
import { toast } from "sonner"
import { Pill } from "@/components/status"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { type ApiIcp, fetchLeadIntelCompanies, findCompanies, useApi } from "@/lib/api"
import { fetchLeadIntelIdsInPipeline } from "@/lib/lists"

/** Pick which of the companies Lead Intel matched to an ICP go into that ICP's pipeline. Lead Intel is only read. */
export function LeadIntelImportDialog({
  workspaceId,
  icps,
  initialIcpId,
  onClose,
  onImported,
}: {
  workspaceId: string
  icps: ApiIcp[]
  initialIcpId: string
  onClose: () => void
  /** Called with the ICP the companies were imported into. */
  onImported: (icpId: string) => void
}) {
  const [icpId, setIcpId] = useState(initialIcpId)
  const icp = icps.find((i) => i.id === icpId) ?? icps[0]
  const companies = useApi(() => fetchLeadIntelCompanies(icp.id), [icp.id])
  // Only which Lead Intel businesses are already in the pipeline: not the whole pipeline.
  const pipeline = useApi(() => fetchLeadIntelIdsInPipeline(workspaceId), [workspaceId])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)

  const list = companies.data ?? []
  const inPipeline = new Set(pipeline.data ?? [])
  const open = list.filter((c) => !inPipeline.has(c.id))
  const picked = open.filter((c) => selected.has(c.id))
  const allChecked = open.length > 0 && picked.length === open.length

  const changeIcp = (id: string) => {
    setIcpId(id)
    setSelected(new Set())
  }
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const run = async () => {
    setRunning(true)
    try {
      const r = (
        await findCompanies(workspaceId, { icpId: icp.id, sources: ["lead_intel"], leadIntelIds: picked.map((c) => c.id) })
      ).leadIntel
      if (r?.error) throw new Error(r.error)
      toast.success(`Imported ${r?.added ?? 0} ${r?.added === 1 ? "company" : "companies"} into ${icp.name}`, {
        description:
          [
            r?.upgraded ? `${r.upgraded} had already been found in Apollo and are now marked as Lead Intel's.` : "",
            r?.excluded ? `${r.excluded} on the do-not-contact list were left out.` : "",
          ]
            .filter(Boolean)
            .join(" ") || undefined,
      })
      onImported(icp.id)
      onClose()
    } catch (e) {
      toast.error("Couldn't import them", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className="flex max-h-[90svh] flex-col gap-4 sm:max-w-3xl!">
        <DialogHeader>
          <DialogTitle>Import from Lead Intel</DialogTitle>
          <DialogDescription>
            Companies Lead Intel matched to an ICP. They&apos;re already verified, so they&apos;re qualified straight away. Free.
          </DialogDescription>
        </DialogHeader>

        <Select value={icp.id} onValueChange={changeIcp}>
          <SelectTrigger aria-label="ICP" className="w-60!">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {icps.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.name} <span className="text-muted-foreground tabular-nums">· {i.companyCount}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
          {companies.error && !companies.data ? (
            <p className="px-3 py-6 text-center text-sm text-destructive">{companies.error}</p>
          ) : !companies.data || !pipeline.data ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              Lead Intel hasn&apos;t matched any companies to {icp.name}.
            </p>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Select all"
                      disabled={open.length === 0}
                      checked={allChecked}
                      onCheckedChange={(v) => setSelected(v === true ? new Set(open.map((c) => c.id)) : new Set())}
                    />
                  </TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="w-28">
                    <span className="sr-only">In pipeline</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((c) => {
                  const had = inPipeline.has(c.id)
                  return (
                    <TableRow
                      key={c.id}
                      className={had ? "opacity-60" : "cursor-pointer"}
                      onClick={() => !had && toggle(c.id, !selected.has(c.id))}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={`Select ${c.name}`}
                          disabled={had}
                          checked={had || selected.has(c.id)}
                          onCheckedChange={(v) => toggle(c.id, v === true)}
                        />
                      </TableCell>
                      <TableCell className="max-w-72">
                        <p className="truncate font-medium">{c.name}</p>
                        <p className="truncate text-[13px] text-muted-foreground">{c.domain ?? "No website"}</p>
                      </TableCell>
                      <TableCell className="text-[13px] whitespace-nowrap">
                        {[c.city, c.state].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-right">{had && <Pill>In pipeline</Pill>}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-[13px] text-muted-foreground tabular-nums">
            {companies.data ? `${picked.length} of ${open.length} selected` : ""}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={running}>
              Cancel
            </Button>
            <Button disabled={running || picked.length === 0} onClick={() => void run()}>
              <Download />{" "}
              {running ? "Importing…" : picked.length ? `Import ${picked.length} ${picked.length === 1 ? "company" : "companies"}` : "Import"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
