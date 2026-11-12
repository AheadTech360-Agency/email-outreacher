"use client"

import { useState } from "react"
import { ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { fetchEmails, useApi } from "@/lib/api"
import { scoreHistogram } from "@/lib/scoring"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { ScoringSettings } from "@/lib/types"

/** Threshold, auto-send and daily cap. One Save for the panel; turning auto-send on asks first. */
export function AutoSendSettings() {
  const { settings } = useStore()
  // The form starts from the saved settings, so it starts again when they arrive or change.
  return <AutoSendForm key={JSON.stringify(settings.scoring)} />
}

function AutoSendForm() {
  const { settings, saveSettings, templates, currentWorkspaceId } = useStore()
  const emails = useApi(
    () => (currentWorkspaceId ? fetchEmails(currentWorkspaceId, { statuses: ["draft", "edited"] }) : Promise.resolve([])),
    [currentWorkspaceId],
  )
  const [draft, setDraft] = useState<ScoringSettings>(settings.scoring)
  const [confirmOn, setConfirmOn] = useState(false)
  const set = <K extends keyof ScoringSettings>(key: K, value: ScoringSettings[K]) => setDraft((d) => ({ ...d, [key]: value }))

  // Unsent drafts the Email Scoring prompt scored; skipped and sent ones no longer matter here.
  const scored = (emails.data ?? [])
    .filter((e) => e.score !== null && (e.status === "draft" || e.status === "edited"))
    .map((e) => ({ score: e.score!, flagged: e.flags.length > 0 }))
  const t = draft.threshold
  const bins = scoreHistogram(scored.map((s) => s.score))
  const tallest = Math.max(1, ...bins)
  const clear = scored.filter((s) => s.score >= t && !s.flagged).length
  const flaggedAbove = scored.filter((s) => s.score >= t && s.flagged).length

  const errors = {
    threshold: !Number.isInteger(t) || t < 0 || t > 100 ? "Use a whole number from 0 to 100" : "",
    cap: !Number.isInteger(draft.dailyAutoSendCap) || draft.dailyAutoSendCap < 0 ? "Use a whole number, 0 or more" : "",
  }
  const valid = !errors.threshold && !errors.cap
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.scoring)
  const scoreTemplates = templates.filter((x) => x.kind === "score")
  const defaultTemplate = scoreTemplates.find((x) => x.isDefault)

  const apply = () =>
    saveSettings({ ...settings, scoring: draft })
      .then(() =>
        toast.success("Saved for everyone in this workspace", {
          description: draft.autoSend
            ? "Nothing is sent on its own yet: approved drafts still go out when someone queues them in Review."
            : "Every draft waits for review.",
        }),
      )
      .catch((e: unknown) => toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined }))

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid || !dirty) return
        if (draft.autoSend && !settings.scoring.autoSend) setConfirmOn(true)
        else apply()
      }}
    >
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="threshold-number">Auto-send threshold</Label>
            <p className="text-xs text-muted-foreground">Leads scoring at or above it can be sent without review.</p>
          </div>
          <Input
            id="threshold-number"
            type="number"
            min={0}
            max={100}
            value={Number.isFinite(t) ? t : ""}
            onChange={(e) => set("threshold", Math.round(Number(e.target.value)))}
            aria-invalid={!!errors.threshold || undefined}
            className="w-20! tabular-nums"
          />
        </div>
        <div className="relative">
          <div className="flex h-24 items-end gap-1" aria-hidden>
            {bins.map((n, i) => (
              <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
                {n > 0 && <span className="text-[11px] text-muted-foreground tabular-nums">{n}</span>}
                <div
                  className={cn("w-full rounded-t-[3px]", i * 10 + 5 >= t ? "bg-data" : "bg-foreground/15")}
                  style={{ height: `${n ? Math.max(6, (n / tallest) * 72) : 0}px` }}
                />
              </div>
            ))}
          </div>
          <div className="absolute -top-1 bottom-0 w-0.5 rounded bg-foreground/70" style={{ left: `${t}%` }} aria-hidden />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Number.isFinite(t) ? t : 0}
          onChange={(e) => set("threshold", Number(e.target.value))}
          aria-label="Auto-send threshold"
          className="w-full accent-data"
        />
        <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
        <p className={cn("text-sm", errors.threshold && "text-destructive")}>
          {errors.threshold ||
            `${clear} of ${scored.length} scored drafts score ${t} or more with no flags.${
              flaggedAbove ? ` ${flaggedAbove} more clear it but are flagged, so a person still reviews them.` : ""
            }`}
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 border-t pt-5">
        <div className="space-y-1">
          <Label htmlFor="auto-send">Send automatically</Label>
          <p className="text-xs text-muted-foreground">
            {draft.autoSend
              ? `On: new drafts at ${t} or more go out as soon as they are scored.`
              : "Off: every draft waits in the review queue, whatever its score."}
          </p>
        </div>
        <Switch id="auto-send" checked={draft.autoSend} onCheckedChange={(v) => set("autoSend", v)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="daily-cap">Daily auto-send limit</Label>
          <Input
            id="daily-cap"
            type="number"
            min={0}
            value={Number.isFinite(draft.dailyAutoSendCap) ? draft.dailyAutoSendCap : ""}
            onChange={(e) => set("dailyAutoSendCap", Math.round(Number(e.target.value)))}
            aria-invalid={!!errors.cap || undefined}
            aria-describedby="daily-cap-note"
          />
          <p id="daily-cap-note" className={errors.cap ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {errors.cap || "Past the limit, drafts wait for review until tomorrow."}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="score-template">Scoring prompt</Label>
          <Select value={draft.promptId ?? "__default__"} onValueChange={(v) => set("promptId", v === "__default__" ? null : v)}>
            <SelectTrigger id="score-template" className="w-full!">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">Use default ({defaultTemplate?.name})</SelectItem>
              {scoreTemplates.map((x) => (
                <SelectItem key={x.id} value={x.id}>
                  {x.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-3 rounded-lg bg-muted/60 p-3 text-[13px]">
        <ShieldCheck className="mt-0.5 size-4 flex-none text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">Always reviewed by a person, whatever the score</p>
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
            <li>Drafts with a flag: sensitive topic, repost, old content, low relevance or off-length</li>
            <li>Drafts regenerated from the review queue</li>
            <li>Anything past the daily limit</li>
          </ul>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={!dirty} onClick={() => setDraft(settings.scoring)}>
          Discard
        </Button>
        <Button type="submit" disabled={!valid || !dirty}>
          Save
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOn}
        onOpenChange={setConfirmOn}
        title="Turn on auto-send?"
        description={`From now on, new drafts scoring ${t} or more with no flags are sent without anyone reading them first, up to ${draft.dailyAutoSendCap} a day. Drafts already in review are not sent.`}
        confirmLabel="Turn on auto-send"
        onConfirm={apply}
      />
    </form>
  )
}
