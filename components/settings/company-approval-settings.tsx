"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ManagerOnly } from "@/components/manager-only"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { DEFAULT_SETTINGS } from "@/lib/defaults"
import { useStore } from "@/lib/store"
import type { CompanyApprovalSettings as Approval } from "@/lib/types"

/** Like auto-send for emails: verified companies at or above the threshold are approved; the rest wait for a person. */
export function CompanyApprovalSettings() {
  const { settings } = useStore()
  const saved = settings.companyApproval ?? DEFAULT_SETTINGS.companyApproval!
  return <Form key={JSON.stringify(saved)} saved={saved} />
}

function Form({ saved }: { saved: Approval }) {
  const { settings, saveSettings } = useStore()
  const [draft, setDraft] = useState<Approval>(saved)
  const t = draft.threshold
  const error = !Number.isInteger(t) || t < 0 || t > 100 ? "Use a whole number from 0 to 100" : ""
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  const save = () =>
    saveSettings({ ...settings, companyApproval: draft })
      .then(() =>
        toast.success("Saved for everyone in this workspace", {
          description: draft.autoApprove
            ? `Companies scoring ${t} or more are approved; the rest wait for you on Companies (To approve).`
            : "Every verified company waits for you on Companies (To approve).",
        }),
      )
      .catch((e: unknown) => toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined }))

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!error && dirty) void save()
      }}
    >
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="company-threshold">Approval threshold</Label>
          <p className="text-xs text-muted-foreground">Companies scoring at or above it are approved without review.</p>
        </div>
        <Input
          id="company-threshold"
          type="number"
          inputMode="numeric"
          className="w-24"
          value={Number.isFinite(t) ? t : ""}
          onChange={(e) => setDraft((d) => ({ ...d, threshold: Math.round(Number(e.target.value)) }))}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="company-auto">Approve automatically</Label>
          <p className="text-xs text-muted-foreground">
            Off: every verified company waits for you, whatever its score. Companies are never rejected without you.
          </p>
        </div>
        <Switch id="company-auto" checked={draft.autoApprove} onCheckedChange={(v) => setDraft((d) => ({ ...d, autoApprove: v }))} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={!dirty} onClick={() => setDraft(saved)}>
          Discard
        </Button>
        <ManagerOnly>
          <Button type="submit" disabled={!!error || !dirty}>
            Save
          </Button>
        </ManagerOnly>
      </div>
    </form>
  )
}
