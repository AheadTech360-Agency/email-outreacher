"use client"

import { useRef, useState, type FormEvent } from "react"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { CampaignInput, Schedule, Step } from "@/lib/config-api"
import { cn } from "@/lib/utils"

export const NEW_CAMPAIGN: CampaignInput = {
  name: "",
  schedule: { timezone: "America/New_York", start: "09:00", end: "17:00", days: [1, 2, 3, 4, 5, 6] },
  steps: [
    { delayDays: 0, threadMode: "new", subject: "{{email1Subject}}", body: "{{email1Body}}" },
    { delayDays: 2, threadMode: "reply", subject: "", body: "Hi {{firstName|there}},\n\nBringing this back to the top of your inbox in case it got buried." },
    { delayDays: 3, threadMode: "reply", subject: "", body: "Hi {{firstName|there}},\n\nLast note from me on this. If the timing's off, no problem at all." },
  ],
}

const ZONES = [
  ["America/New_York", "Eastern (New York)"],
  ["America/Chicago", "Central (Chicago)"],
  ["America/Denver", "Mountain (Denver)"],
  ["America/Phoenix", "Arizona (Phoenix)"],
  ["America/Los_Angeles", "Pacific (Los Angeles)"],
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawaii"],
  ["UTC", "UTC"],
] as const

const DAYS = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [7, "Sun"],
] as const

/** The campaign's name, sending window and emails. Saving is the caller's (onSave). */
export function CampaignEditor({
  initial,
  variables,
  disabled,
  saveLabel,
  onSave,
}: {
  initial: CampaignInput
  variables: Record<string, string>
  disabled?: boolean
  saveLabel: string
  onSave: (input: CampaignInput) => Promise<void>
}) {
  const [name, setName] = useState(initial.name)
  const [schedule, setSchedule] = useState<Schedule>(initial.schedule)
  const [steps, setSteps] = useState<Step[]>(initial.steps.map((s) => ({ ...s })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The field a variable chip inserts into: the last one focused.
  const focused = useRef<{ index: number; field: "subject" | "body"; el: HTMLInputElement | HTMLTextAreaElement } | null>(null)

  const update = (i: number, patch: Partial<Step>) => setSteps((cur) => cur.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const move = (i: number, by: -1 | 1) =>
    setSteps((cur) => {
      const next = [...cur]
      ;[next[i], next[i + by]] = [next[i + by], next[i]]
      return next
    })

  const insert = (name: string) => {
    const at = focused.current
    if (!at) return
    const token = `{{${name}}}`
    const el = at.el
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const value = el.value.slice(0, start) + token + el.value.slice(end)
    update(at.index, { [at.field]: value })
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) return setError("Name the campaign.")
    if (!steps[0]?.subject.trim()) return setError("The first email needs a subject.")
    if (steps.some((s) => !s.body.trim())) return setError("Every email needs a body.")
    if (!schedule.days.length) return setError("Pick at least one day to send on.")
    if (schedule.start >= schedule.end) return setError("The sending window must start before it ends.")
    setError(null)
    setBusy(true)
    try {
      await onSave({ name: name.trim(), schedule, steps: steps.map((s, i) => ({ ...s, delayDays: i === 0 ? 0 : s.delayDays, threadMode: i === 0 ? "new" : s.threadMode })) })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the campaign.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <section className="space-y-5 rounded-xl border bg-card p-5 md:p-6">
        <div className="space-y-1.5">
          <Label htmlFor="campaign-name">Campaign name</Label>
          <Input id="campaign-name" value={name} disabled={disabled} onChange={(e) => setName(e.target.value)} placeholder="Apparel brands, November" className="max-w-md" />
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_120px_120px_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <Label htmlFor="campaign-zone">Timezone</Label>
            <Select value={schedule.timezone} disabled={disabled} onValueChange={(timezone) => setSchedule({ ...schedule, timezone })}>
              <SelectTrigger id="campaign-zone" className="w-full">
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-start">From</Label>
            <Input id="campaign-start" type="time" value={schedule.start} disabled={disabled} onChange={(e) => setSchedule({ ...schedule, start: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-end">Until</Label>
            <Input id="campaign-end" type="time" value={schedule.end} disabled={disabled} onChange={(e) => setSchedule({ ...schedule, end: e.target.value })} />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium">Days</legend>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map(([day, label]) => {
                const on = schedule.days.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => setSchedule({ ...schedule, days: on ? schedule.days.filter((d) => d !== day) : [...schedule.days, day].sort() })}
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
        <p className="text-[12.5px] text-muted-foreground">
          Emails go out at random times inside these hours (in the timezone above), one per mailbox at a time and never past a mailbox&apos;s daily limit.
        </p>
      </section>

      <section aria-label="Variables" className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12.5px] text-muted-foreground">Insert into the field you&apos;re typing in:</span>
        {Object.entries(variables).map(([name, help]) => (
          <button
            key={name}
            type="button"
            title={help}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insert(name)}
            className="rounded-md border bg-card px-2 py-1 font-mono text-[12px] text-foreground/85 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            {`{{${name}}}`}
          </button>
        ))}
      </section>

      <ol className="space-y-4">
        {steps.map((step, i) => {
          const showSubject = i === 0 || step.threadMode === "new"
          return (
            <li key={i} className="rounded-xl border bg-card">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-3">
                <span className="text-[14px] font-semibold">Email {i + 1}</span>
                {i === 0 ? (
                  <span className="text-[12.5px] text-muted-foreground">Sent first, in a new thread</span>
                ) : (
                  <>
                    <label className="flex items-center gap-2 text-[13px] whitespace-nowrap">
                      Wait
                      <Input
                        aria-label={`Days to wait before email ${i + 1}`}
                        inputMode="numeric"
                        className="h-8 w-16!"
                        value={String(step.delayDays)}
                        disabled={disabled}
                        onChange={(e) => update(i, { delayDays: Math.min(90, Number(e.target.value.replace(/\D/g, "") || 0)) })}
                      />
                      days after the last one
                    </label>
                    <Select value={step.threadMode} disabled={disabled} onValueChange={(v) => update(i, { threadMode: v as Step["threadMode"] })}>
                      <SelectTrigger className="h-8 w-44" aria-label={`Thread for email ${i + 1}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reply">Reply in the same thread</SelectItem>
                        <SelectItem value="new">Start a new thread</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}
                <div className="ml-auto flex gap-1">
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move email ${i + 1} up`} disabled={disabled || i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Move email ${i + 1} down`} disabled={disabled || i === steps.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove email ${i + 1}`} disabled={disabled || steps.length === 1} onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </div>
              </div>
              <div className="space-y-3 px-5 py-4">
                {showSubject ? (
                  <Input
                    aria-label={`Subject of email ${i + 1}`}
                    placeholder="Subject"
                    value={step.subject}
                    disabled={disabled}
                    onFocus={(e) => (focused.current = { index: i, field: "subject", el: e.currentTarget })}
                    onChange={(e) => update(i, { subject: e.target.value })}
                  />
                ) : (
                  <p className="text-[12.5px] text-muted-foreground">Subject: &quot;Re:&quot; and email 1&apos;s subject, so it lands in the same thread.</p>
                )}
                <Textarea
                  aria-label={`Body of email ${i + 1}`}
                  rows={i === 0 ? 4 : 5}
                  value={step.body}
                  disabled={disabled}
                  onFocus={(e) => (focused.current = { index: i, field: "body", el: e.currentTarget })}
                  onChange={(e) => update(i, { body: e.target.value })}
                  className="font-[inherit] leading-6"
                />
              </div>
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || steps.length >= 10}
          onClick={() => setSteps([...steps, { delayDays: 3, threadMode: "reply", subject: "", body: "" }])}
        >
          <Plus /> Add an email
        </Button>
        <span className="flex-1" />
        {error && (
          <p role="alert" className="text-[13px] text-negative">
            {error}
          </p>
        )}
        <Button type="submit" disabled={disabled || busy}>
          {busy ? "Saving…" : saveLabel}
        </Button>
      </div>
      <p className="text-[12.5px] text-muted-foreground">
        The signature is added under every email from the mailbox&apos;s persona. A value that might be empty needs a fallback, like {"{{firstName|there}}"}.
      </p>
    </form>
  )
}
