"use client"

import { useState } from "react"
import { Archive, ArchiveRestore } from "lucide-react"
import { toast } from "sonner"
import { ManagerOnly } from "@/components/manager-only"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { archiveRecords } from "@/lib/api"

export function ArchiveFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Select value={value} onValueChange={onChange}>
    <SelectTrigger size="sm" className="w-36" aria-label="Filter by archive status"><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="active">Active</SelectItem>
      <SelectItem value="archived">Archived</SelectItem>
      <SelectItem value="all">Active and archived</SelectItem>
    </SelectContent>
  </Select>
}

export function ArchiveRecordsButton({ workspaceId, kind, ids, restore = false, disabled = false, onChanged }: {
  workspaceId: string; kind: "company" | "person" | "product"; ids: string[]
  restore?: boolean; disabled?: boolean; onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  return <ManagerOnly><Button variant="outline" size="sm" disabled={disabled || busy || !ids.length || ids.length > 5000}
    onClick={async () => {
      setBusy(true)
      try {
        const result = await archiveRecords(workspaceId, kind, ids, !restore)
        toast.success(`${restore ? "Restored" : "Archived"} ${result.changed} records`)
        onChanged()
      } catch (e) {
        toast.error("Could not update records", { description: e instanceof Error ? e.message : undefined })
      } finally { setBusy(false) }
    }}>
    {restore ? <ArchiveRestore /> : <Archive />} {busy ? "Saving..." : restore ? "Restore" : "Archive"}
  </Button></ManagerOnly>
}
