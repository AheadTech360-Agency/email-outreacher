"use client"

import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { type Candidate, addLeads, errorText, fetchCandidates } from "@/lib/config-api"

/** Pick Coldbrew leads to put into the campaign. Only leads that can be added are offered: an email address, not in a
 * running campaign, never queued before (here or through CheapSequencer). */
export function AddLeadsDialog({ wsId, campaignId, icpName, needsFirstEmail, onClose, onAdded }: {
  wsId: string
  campaignId: string
  /** An ICP's campaign: its leads are offered first. */
  icpName: string | null
  needsFirstEmail: boolean
  onClose: () => void
  onAdded: () => void
}) {
  const [query, setQuery] = useState("")
  const [q, setQ] = useState("")
  const [approvedOnly, setApprovedOnly] = useState(true)
  const [icpOnly, setIcpOnly] = useState(true)
  const [rows, setRows] = useState<Candidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setQ(query), 300)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    let live = true
    fetchCandidates(wsId, campaignId, q, approvedOnly, icpOnly)
      .then((r) => live && (setRows(r), setError(null)))
      .catch((e: unknown) => live && setError(errorText(e)))
    return () => {
      live = false
    }
  }, [wsId, campaignId, q, approvedOnly, icpOnly])

  const list = rows ?? []
  const allPicked = list.length > 0 && list.every((c) => picked.has(c.id))
  const toggle = (ids: string[], on: boolean) =>
    setPicked((cur) => {
      const next = new Set(cur)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  const add = async () => {
    if (busy || !picked.size) return
    setBusy(true)
    try {
      const r = await addLeads(wsId, campaignId, [...picked])
      const skipped = Object.entries(r.skipped)
      toast.success(`Added ${r.added} ${r.added === 1 ? "lead" : "leads"}`, {
        description: skipped.length ? `Left out: ${skipped.map(([why, n]) => `${n} ${why.toLowerCase()}`).join("; ")}.` : undefined,
      })
      onAdded()
    } catch (e) {
      toast.error("Couldn't add the leads", { description: errorText(e) })
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="gap-4 sm:max-w-2xl!">
        <DialogHeader>
          <DialogTitle>Add leads</DialogTitle>
          <DialogDescription>
            Coldbrew leads with an email address who aren&apos;t in a running campaign and were never queued before, here or through CheapSequencer.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Search leads" placeholder="Search name, email or company" className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <Switch checked={approvedOnly} onCheckedChange={setApprovedOnly} />
            Only with an approved Coldbrew email
          </label>
          {icpName && (
            <label className="flex items-center gap-2 text-[13px]">
              <Switch checked={icpOnly} onCheckedChange={setIcpOnly} />
              Only {icpName}&apos;s leads
            </label>
          )}
        </div>
        {needsFirstEmail && !approvedOnly && (
          <p className="text-[12.5px] text-muted-foreground">Email 1 sends the Coldbrew-written email, so leads without an approved one are left out when added.</p>
        )}
        <div className="overflow-hidden rounded-md border">
          <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2 text-[13px]">
            <Checkbox aria-label="Select every lead shown" checked={allPicked} disabled={!list.length} onCheckedChange={(v) => toggle(list.map((c) => c.id), v === true)} />
            <span className="tabular-nums">{picked.size ? `${picked.size} selected` : `${list.length}${list.length === 500 ? "+" : ""} leads`}</span>
          </div>
          {error ? (
            <p role="alert" className="p-4 text-[13px] text-negative">
              {error}
            </p>
          ) : !rows ? (
            <p className="p-4 text-[13px] text-muted-foreground">Loading leads…</p>
          ) : !list.length ? (
            <p className="p-4 text-[13px] text-muted-foreground">
              {q ? "No lead matches." : approvedOnly ? "No lead has an approved Coldbrew email waiting. Approve drafts in Coldbrew first." : "No lead can be added."}
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-rule overflow-y-auto">
              {list.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-[13.5px] hover:bg-muted/50">
                    <Checkbox checked={picked.has(c.id)} onCheckedChange={(v) => toggle([c.id], v === true)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block truncate text-[12.5px] text-muted-foreground">{[c.email, c.company].filter(Boolean).join(", ")}</span>
                    </span>
                    {!c.hasFirstEmail && <span className="flex-none text-[12px] text-muted-foreground">No approved email</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void add()} disabled={busy || !picked.size}>
            {busy ? "Adding…" : `Add ${picked.size || ""} ${picked.size === 1 ? "lead" : "leads"}`.replace("  ", " ")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
