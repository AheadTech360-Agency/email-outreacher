"use client"

import { useState, type FormEvent, type ReactNode } from "react"
import { toast } from "sonner"
import { LoadError } from "@/components/config/load-error"
import { Page } from "@/components/config/shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { type OwnSettings, type OwnSettingsOut, canManage, errorText, fetchOwnSettings, saveOwnSettings, useApi } from "@/lib/config-api"
import { useSession } from "@/lib/config-session"
import { cn } from "@/lib/utils"

const ZONES = [
  ["America/New_York", "Eastern (New York)"],
  ["America/Chicago", "Central (Chicago)"],
  ["America/Denver", "Mountain (Denver)"],
  ["America/Phoenix", "Arizona (Phoenix)"],
  ["America/Los_Angeles", "Pacific (Los Angeles)"],
  ["UTC", "UTC"],
] as const
const DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]] as const

export default function SettingsPage() {
  const { workspaceId } = useSession()
  const settings = useApi(() => (workspaceId ? fetchOwnSettings(workspaceId) : Promise.resolve(null)), [workspaceId])
  return (
    <Page title="Settings" description="This workspace's sending limits, how its mailboxes warm up, and LinkedIn and Instagram limits. Mailboxes and social accounts can each have their own; new ones start from these.">
      {settings.error && !settings.data ? (
        <LoadError message={settings.error} onRetry={settings.reload} />
      ) : !settings.data || !workspaceId ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      ) : (
        <SettingsForm key={JSON.stringify(settings.data)} wsId={workspaceId} initial={settings.data} onSaved={settings.setData} />
      )}
    </Page>
  )
}

function SettingsForm({ wsId, initial, onSaved }: { wsId: string; initial: OwnSettingsOut; onSaved: (s: OwnSettingsOut) => void }) {
  const { me } = useSession()
  const manager = canManage(me?.role)
  const [v, setV] = useState<OwnSettings>(initial)
  const [cap, setCap] = useState(initial.workspaceDailyCap === null ? "" : String(initial.workspaceDailyCap))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof OwnSettings>(key: K, value: OwnSettings[K]) => setV((cur) => ({ ...cur, [key]: value }))
  const num = (key: keyof OwnSettings) => (e: React.ChangeEvent<HTMLInputElement>) => set(key, Number(e.target.value.replace(/\D/g, "") || 0) as never)
  // Unsaved changes: what's on screen against what was loaded, compared field by field (the live switches aren't settings).
  const current: OwnSettings = { ...v, workspaceDailyCap: cap ? Number(cap) : null }
  const dirty = (Object.keys(current) as (keyof OwnSettings)[]).some((k) => JSON.stringify(current[k]) !== JSON.stringify(initial[k]))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (v.minGapMinutes > v.maxGapMinutes) return setError("The shortest gap between sends can't be longer than the longest.")
    if (v.warmupStart >= v.warmupEnd) return setError("The warm-up window must start before it ends.")
    if (!v.warmupDays.length) return setError("Pick at least one day for warm-up.")
    if (v.linkedinDailyInvites > v.linkedinWeeklyInvites) return setError("LinkedIn connection requests a day can't be more than a week.")
    if (v.socialMinGapMinutes > v.socialMaxGapMinutes) return setError("The shortest gap between LinkedIn and Instagram actions can't be longer than the longest.")
    setError(null)
    setBusy(true)
    try {
      const saved = await saveOwnSettings(wsId, { ...v, workspaceDailyCap: cap ? Number(cap) : null })
      onSaved(saved)
      toast.success("Settings saved", { description: "The next sending and warm-up run uses them." })
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Card
        title="Sending"
        live={initial.sendingLive}
        liveName="OWN_SENDING_LIVE"
        aside={
          <label className="flex items-center gap-2.5 text-[13.5px]">
            <Switch checked={!v.sendingPaused} disabled={!manager} onCheckedChange={(on) => set("sendingPaused", !on)} />
            {v.sendingPaused ? "Paused" : "On"}
          </label>
        }
      >
        {v.sendingPaused && <p className="text-[13px] text-warning">Every campaign in this workspace is held: nothing is sent until you turn this back on.</p>}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="default-limit" label="Daily limit for new mailboxes" hint="Each mailbox can be changed on its own.">
            <Input id="default-limit" inputMode="numeric" value={String(v.defaultDailyLimit)} disabled={!manager} onChange={num("defaultDailyLimit")} />
          </Field>
          <Field id="cap" label="Workspace daily cap" hint="All mailboxes together. Empty: no cap.">
            <Input id="cap" inputMode="numeric" placeholder="No cap" value={cap} disabled={!manager} onChange={(e) => setCap(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field id="gap-min" label="Gap between sends, from" hint="Minutes between one mailbox's emails, picked at random…">
            <Input id="gap-min" inputMode="numeric" value={String(v.minGapMinutes)} disabled={!manager} onChange={num("minGapMinutes")} />
          </Field>
          <Field id="gap-max" label="to" hint="…between these two, so it never sends in bursts.">
            <Input id="gap-max" inputMode="numeric" value={String(v.maxGapMinutes)} disabled={!manager} onChange={num("maxGapMinutes")} />
          </Field>
        </div>
        <p className="text-[12.5px] text-muted-foreground">Each campaign&apos;s own sending window (days and hours) is set on the campaign.</p>
      </Card>

      <Card
        title="Warming"
        live={initial.warmupLive}
        liveName="OWN_WARMUP_LIVE"
        aside={
          <label className="flex items-center gap-2.5 text-[13.5px]">
            <Switch checked={v.warmupEnabled} disabled={!manager} onCheckedChange={(on) => set("warmupEnabled", on)} />
            {v.warmupEnabled ? "On" : "Off"}
          </label>
        }
      >
        {!v.warmupEnabled && <p className="text-[13px] text-warning">Warming accounts in this workspace send and open nothing until you turn this back on.</p>}
        <div className="grid gap-5 md:grid-cols-[minmax(0,220px)_120px_120px_minmax(0,1fr)]">
          <Field id="zone" label="Timezone">
            <Select value={v.warmupTimezone} disabled={!manager} onValueChange={(z) => set("warmupTimezone", z)}>
              <SelectTrigger id="zone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZONES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="w-start" label="From">
            <Input id="w-start" type="time" value={v.warmupStart} disabled={!manager} onChange={(e) => set("warmupStart", e.target.value)} />
          </Field>
          <Field id="w-end" label="Until">
            <Input id="w-end" type="time" value={v.warmupEnd} disabled={!manager} onChange={(e) => set("warmupEnd", e.target.value)} />
          </Field>
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium">Days</legend>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map(([day, label]) => {
                const on = v.warmupDays.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    disabled={!manager}
                    onClick={() => set("warmupDays", on ? v.warmupDays.filter((d) => d !== day) : [...v.warmupDays, day].sort())}
                    className={cn(
                      "h-8 w-11 rounded-md border text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "border-primary bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </fieldset>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <Field id="w-start-per-day" label="Emails on day one" hint="A new warming mailbox starts here…">
            <Input id="w-start-per-day" inputMode="numeric" value={String(v.warmupStartPerDay)} disabled={!manager} onChange={num("warmupStartPerDay")} />
          </Field>
          <Field id="w-ramp" label="Added each day" hint="…and adds this many a day up to its target.">
            <Input id="w-ramp" inputMode="numeric" value={String(v.warmupRampPerDay)} disabled={!manager} onChange={num("warmupRampPerDay")} />
          </Field>
          <Field id="w-target" label="Daily target for new mailboxes" hint="Each mailbox can be changed on its own.">
            <Input id="w-target" inputMode="numeric" value={String(v.warmupDefaultTarget)} disabled={!manager} onChange={num("warmupDefaultTarget")} />
          </Field>
          <Field id="w-reply" label="Reply to (%) for new mailboxes" hint="The share of warm-up emails it answers.">
            <Input id="w-reply" inputMode="numeric" value={String(v.warmupDefaultReplyPercent)} disabled={!manager} onChange={num("warmupDefaultReplyPercent")} />
          </Field>
          <Field id="w-star" label="Star (%)" hint="The share it marks as important.">
            <Input id="w-star" inputMode="numeric" value={String(v.warmupStarPercent)} disabled={!manager} onChange={num("warmupStarPercent")} />
          </Field>
        </div>
      </Card>

      <Card title="LinkedIn and Instagram" status="Limits for each connected account. Each account on the Social accounts page can have its own.">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="li-invites" label="LinkedIn connection requests a day" hint="Per account. LinkedIn restricts accounts that send too many.">
            <Input id="li-invites" inputMode="numeric" value={String(v.linkedinDailyInvites)} disabled={!manager} onChange={num("linkedinDailyInvites")} />
          </Field>
          <Field id="li-week" label="LinkedIn connection requests a week" hint="Per account, whatever the daily number.">
            <Input id="li-week" inputMode="numeric" value={String(v.linkedinWeeklyInvites)} disabled={!manager} onChange={num("linkedinWeeklyInvites")} />
          </Field>
          <Field id="li-messages" label="LinkedIn messages a day" hint="Per account, to people already connected.">
            <Input id="li-messages" inputMode="numeric" value={String(v.linkedinDailyMessages)} disabled={!manager} onChange={num("linkedinDailyMessages")} />
          </Field>
          <Field id="ig-messages" label="Instagram messages a day" hint="Per account.">
            <Input id="ig-messages" inputMode="numeric" value={String(v.instagramDailyMessages)} disabled={!manager} onChange={num("instagramDailyMessages")} />
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="s-gap-min" label="Gap between actions, from" hint="Minutes between one account's requests and messages, picked at random…">
            <Input id="s-gap-min" inputMode="numeric" value={String(v.socialMinGapMinutes)} disabled={!manager} onChange={num("socialMinGapMinutes")} />
          </Field>
          <Field id="s-gap-max" label="to" hint="…between these two.">
            <Input id="s-gap-max" inputMode="numeric" value={String(v.socialMaxGapMinutes)} disabled={!manager} onChange={num("socialMaxGapMinutes")} />
          </Field>
        </div>
      </Card>

      {manager && (
        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-end gap-3 rounded-xl border bg-card/95 px-4 py-3 backdrop-blur">
          {error ? (
            <p role="alert" className="mr-auto text-[13px] text-negative">
              {error}
            </p>
          ) : (
            dirty && <p className="mr-auto text-[13px] text-muted-foreground">Unsaved changes</p>
          )}
          <Button type="button" variant="ghost" disabled={!dirty || busy} onClick={() => (setV(initial), setCap(initial.workspaceDailyCap === null ? "" : String(initial.workspaceDailyCap)), setError(null))}>
            Discard
          </Button>
          <Button type="submit" disabled={!dirty || busy}>
            {busy ? "Saving…" : "Save settings"}
          </Button>
        </div>
      )}
    </form>
  )
}

function Card({ title, live, liveName, status, aside, children }: {
  title: string
  live?: boolean
  liveName?: string
  status?: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="space-y-5 rounded-xl border bg-card p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <p className="text-[12.5px] text-muted-foreground">
            {status ?? (live ? "Live: emails go out for real." : `Dry run: nothing goes out until ${liveName} is turned on in Railway.`)}
          </p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-[12.5px] leading-[18px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
