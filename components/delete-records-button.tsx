"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { ManagerOnly } from "@/components/manager-only"
import { Button } from "@/components/ui/button"
import { deleteRecords } from "@/lib/api"

export function DeleteRecordsButton({ workspaceId, kind, ids, onDeleted, disabled = false, label: buttonLabel, noEmailOnly = false }: {
  workspaceId: string
  kind: "company" | "person" | "email"
  ids: string[]
  onDeleted: () => void
  noEmailOnly?: boolean
  label?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const label = kind === "company" ? "companies" : kind === "person" ? "people" : "emails"
  const details = kind === "company"
    ? "Their associated people, leads, posts, website pages, drafts, and ratings are also permanently deleted."
    : kind === "person" ? "Their linked leads, posts, drafts, and ratings are also permanently deleted."
      : "The selected emails and their ratings are permanently deleted. Their people and leads are kept."
  return <>
    <ManagerOnly>
    <Button size="sm" variant="destructive" title={ids.length > 5000 ? "Select 5,000 records or fewer" : undefined} disabled={disabled || busy || !ids.length || ids.length > 5000} onClick={() => setOpen(true)}>
      <Trash2 /> {busy ? "Deleting..." : buttonLabel ?? `Delete ${ids.length}`}
    </Button>
    </ManagerOnly>
    <ConfirmDialog open={open} onOpenChange={setOpen} title={`Permanently delete ${ids.length} ${label}?`}
      description={`${details} This removes records from this workspace's database. Source records in Lead Intel and external services stay. Records still queued for sending must be removed from their sequence first.`}
      confirmLabel="Delete permanently" destructive onConfirm={async () => {
        setBusy(true)
        try {
          const result = await deleteRecords(workspaceId, kind, ids, noEmailOnly)
          toast.success(`Deleted ${result.deleted} ${label}`)
          onDeleted()
        } catch (e) {
          toast.error("Could not delete records", { description: e instanceof Error ? e.message : undefined })
        } finally {
          setBusy(false)
        }
      }} />
  </>
}
