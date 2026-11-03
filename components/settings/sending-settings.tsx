"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Pill } from "@/components/status"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { type SendingSettings as Values, type TemplateOutcome, fetchSendingSettings, saveSendingSettings, useApi } from "@/lib/api"
import { useStore } from "@/lib/store"

/** Who the emails are from, and what follow-ups say until Coldbrew writes the personal one. */
export function SendingSettings() {
  const { currentWorkspaceId } = useStore()
  const saved = useApi(() => (currentWorkspaceId ? fetchSendingSettings(currentWorkspaceId) : Promise.resolve(null)), [currentWorkspaceId])
  if (saved.error && !saved.data) return <p className="text-sm text-destructive">Couldn&apos;t load these settings: {saved.error}</p>
  if (!saved.data || !currentWorkspaceId) return <Skeleton className="h-72 w-full" />
  return <Form key={currentWorkspaceId + JSON.stringify(saved.data)} wsId={currentWorkspaceId} saved={saved.data} onSaved={saved.reload} />
}

function Form({ wsId, saved, onSaved }: { wsId: string; saved: Values; onSaved: () => void }) {
  const [draft, setDraft] = useState({ ...saved, followupLeadHours: String(saved.followupLeadHours) })
  const [busy, setBusy] = useState(false)
  const [templates, setTemplates] = useState<TemplateOutcome[]>([])
  const hours = Number(draft.followupLeadHours)
  const errors = {
    followupFallback2: draft.followupFallback2.trim() ? "" : "Write what email 2 says until it's personalized",
    followupFallback3: draft.followupFallback3.trim() ? "" : "Write what email 3 says until it's personalized",
    followupLeadHours: Number.isInteger(hours) && hours >= 2 && hours <= 72 ? "" : "Use a whole number from 2 to 72",
  }
  const values: Values = { ...draft, followupLeadHours: hours }
  const valid = !Object.values(errors).some(Boolean)
  const dirty = JSON.stringify(values) !== JSON.stringify(saved)
  const missing = !draft.senderCompany.trim() || !draft.senderWebsite.trim()

  const submit = async () => {
    setBusy(true)
    try {
      const r = await saveSendingSettings(wsId, values)
      setTemplates(r.templates)
      const updated = r.templates.filter((t) => t.status === "updated").length
      toast.success("Saved", {
        description: updated ? `The signature is now in ${updated} campaign${updated === 1 ? "" : "s"}.` : "The campaigns already had it.",
      })
      onSaved()
    } catch (e) {
      toast.error("Couldn't save them", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  const text = (key: "followupFallback2" | "followupFallback3", label: string, hint: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Textarea
        id={key}
        rows={3}
        value={draft[key]}
        aria-invalid={!!errors[key] || undefined}
        aria-describedby={`${key}-hint`}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
      />
      <p id={`${key}-hint`} className={errors[key] ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {errors[key] || hint}
      </p>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="senderCompany">Company name</Label>
          <Input id="senderCompany" value={draft.senderCompany} onChange={(e) => setDraft((d) => ({ ...d, senderCompany: e.target.value }))} />
          <p className="text-xs text-muted-foreground">Shown under the sender&apos;s name.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="senderWebsite">Website</Label>
          <Input
            id="senderWebsite"
            placeholder="aheadtech360.com"
            value={draft.senderWebsite}
            onChange={(e) => setDraft((d) => ({ ...d, senderWebsite: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">Shown under the company name.</p>
        </div>
      </div>
      {missing && <p className="text-xs text-warning">Emails can&apos;t be queued until both are filled in.</p>}
      {text("followupFallback2", "Email 2 until it's personalized", "{{first_name}} is filled in. Only goes out if the personal follow-up couldn't be written in time.")}
      {text("followupFallback3", "Email 3 until it's personalized", "Same, for the last email.")}
      <div className="space-y-1.5">
        <Label htmlFor="followupLeadHours">Write follow-ups this many hours before they&apos;re due</Label>
        <Input
          id="followupLeadHours"
          type="number"
          inputMode="numeric"
          min={2}
          max={72}
          className="w-28"
          value={draft.followupLeadHours}
          aria-invalid={!!errors.followupLeadHours || undefined}
          aria-describedby="followupLeadHours-hint"
          onChange={(e) => setDraft((d) => ({ ...d, followupLeadHours: e.target.value }))}
        />
        <p id="followupLeadHours-hint" className={errors.followupLeadHours ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {errors.followupLeadHours || "Coldbrew checks every 30 minutes. Leads who reply before then never cost a follow-up."}
        </p>
      </div>
      <Button disabled={!valid || !dirty || busy} onClick={() => void submit()}>
        {busy ? "Saving…" : "Save"}
      </Button>
      {templates.length > 0 && (
        <ul className="divide-y divide-rule rounded-md border text-[13px]">
          {templates.map((t) => (
            <li key={t.campaign} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate">{t.campaign}</span>
              {t.reason && <span className="truncate text-xs text-muted-foreground">{t.reason}</span>}
              <Pill tone={t.status === "updated" ? "positive" : t.status === "skipped" ? "warning" : "neutral"}>
                {t.status === "updated" ? "Updated" : t.status === "skipped" ? "Not changed" : "Already set"}
              </Pill>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
