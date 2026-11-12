"use client"

import { useState, type ReactNode } from "react"
import { AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { AutoSendSettings } from "@/components/auto-send-settings"
import { CompanyApprovalSettings } from "@/components/settings/company-approval-settings"
import { FeedbackSettings } from "@/components/feedback/feedback-settings"
import { ExclusionsSettings } from "@/components/settings/exclusions-settings"
import { ResearchSettings } from "@/components/settings/research-settings"
import { SendingSettings } from "@/components/settings/sending-settings"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetchUsage, useApi } from "@/lib/api"
import { MODELS, formatUsd } from "@/lib/format"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

// The services the backend calls, and the .env key each one reads.
const CONNECTIONS = [
  { name: "Claude (Anthropic)", purpose: "Company verification, hook selection, email writing and scoring", env: "ANTHROPIC_API_KEY" },
  { name: "Apollo", purpose: "Finding companies and people, revealing emails", env: "APOLLO_API_KEY" },
  { name: "Apify", purpose: "LinkedIn people and posts, Instagram profiles and posts", env: "APIFY_TOKEN" },
  { name: "Jina", purpose: "Reading websites our own crawler can't (optional)", env: "JINA_API_KEY" },
  { name: "CheapSequencer", purpose: "Campaigns, sending and warmup", env: "CHEAPSEQUENCER_API_KEY" },
  { name: "CheapInboxes", purpose: "Mailboxes and their domains", env: "CHEAPINBOXES_API_KEY" },
]

const WARN_AT = 0.8

/** One settings card: a header with what it controls, then its controls. */
function Panel({
  id,
  title,
  description,
  children,
}: {
  id?: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-lg border">
      <header className="border-b border-rule px-5 py-4">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

export default function SettingsPage() {
  const { settings } = useStore()
  // The form starts from the saved settings, so it starts again when they arrive or change.
  return <SettingsView key={JSON.stringify(settings)} />
}

function SettingsView() {
  const { settings, saveSettings, currentWorkspaceId } = useStore()
  // What Claude, Apollo and Apify have cost since the 1st, from the Usage log.
  const usage = useApi(() => fetchUsage(currentWorkspaceId, new Date().getDate()), [currentWorkspaceId])
  const spent = usage.data?.providers.reduce((sum, p) => sum + p.costUsd, 0) ?? 0
  const [draft, setDraft] = useState({
    defaultModel: settings.defaultModel,
    postsPerLead: String(settings.postsPerLead),
    maxPostAgeDays: String(settings.maxPostAgeDays),
    monthlyBudgetUsd: String(settings.monthlyBudgetUsd),
    prospectorRunLimitUsd: String(settings.prospectorRunLimitUsd ?? 5),
  })

  const parsed = {
    postsPerLead: Number(draft.postsPerLead),
    maxPostAgeDays: Number(draft.maxPostAgeDays),
    monthlyBudgetUsd: Number(draft.monthlyBudgetUsd),
    prospectorRunLimitUsd: Number(draft.prospectorRunLimitUsd),
  }
  const errors = {
    postsPerLead: !Number.isInteger(parsed.postsPerLead) || parsed.postsPerLead < 1 || parsed.postsPerLead > 20 ? "Use a whole number from 1 to 20" : "",
    maxPostAgeDays: !Number.isInteger(parsed.maxPostAgeDays) || parsed.maxPostAgeDays < 1 ? "Use a whole number of days, 1 or more" : "",
    monthlyBudgetUsd: !(parsed.monthlyBudgetUsd > 0) ? "Enter a budget above $0" : "",
    prospectorRunLimitUsd:
      !(parsed.prospectorRunLimitUsd >= 0 && parsed.prospectorRunLimitUsd <= 10000) ? "Enter an amount from $0 to $10,000" : "",
  }
  const valid = !Object.values(errors).some(Boolean)
  const dirty =
    draft.defaultModel !== settings.defaultModel ||
    parsed.postsPerLead !== settings.postsPerLead ||
    parsed.maxPostAgeDays !== settings.maxPostAgeDays ||
    parsed.monthlyBudgetUsd !== settings.monthlyBudgetUsd ||
    parsed.prospectorRunLimitUsd !== (settings.prospectorRunLimitUsd ?? 5)

  const ratio = spent / settings.monthlyBudgetUsd
  const over = ratio >= 1
  const near = ratio >= WARN_AT
  const remaining = settings.monthlyBudgetUsd - spent

  const save = () =>
    saveSettings({ ...settings, defaultModel: draft.defaultModel, ...parsed })
      .then(() => toast.success("Settings saved for everyone in this workspace"))
      .catch((e: unknown) => toast.error("Couldn't save settings", { description: e instanceof Error ? e.message : undefined }))

  const numberField = (key: "postsPerLead" | "maxPostAgeDays" | "monthlyBudgetUsd" | "prospectorRunLimitUsd", label: string, hint: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type="number"
        inputMode="decimal"
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
    <>
      <PageHeader
        title="Settings"
        description={`Auto-send threshold ${settings.scoring.threshold} · auto-send ${settings.scoring.autoSend ? "on" : "off"} · ${formatUsd(spent)} of ${formatUsd(settings.monthlyBudgetUsd)} spent this month`}
      />
      {/* Two columns of different weight: scoring and sending, which change often, get the wide one. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 px-4 pb-10 md:px-8 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        <div className="min-w-0 space-y-6">
          <Panel
            id="scoring"
            title="Review and auto-send"
            description="Every drafted email gets an AI lead score. Below the threshold a person reviews it; at or above it, with auto-send on, it goes out on its own."
          >
            <AutoSendSettings />
          </Panel>
          <Panel
            id="company-approval"
            title="Company approval"
            description="Every verified company gets a fit score. At or above the threshold it's approved; below it, it waits for you to approve or reject on the Companies page. Quick Start pauses for these."
          >
            <CompanyApprovalSettings />
          </Panel>
          <Panel
            id="sending"
            title="Sending"
            description="Every email ends with the sender's name, this company and its website. Saving writes them into each Coldbrew campaign in CheapSequencer that isn't sending."
          >
            <SendingSettings />
          </Panel>
          <Panel
            id="feedback"
            title="Learning from feedback"
            description="Claude doesn't retrain on your ratings. Each new email is written with the ICP's latest rated emails in its prompt; these set how many."
          >
            <FeedbackSettings />
          </Panel>
          <Panel
            id="research"
            title="Website reading"
            description="When you research a company, Claude reads its website one page at a time and decides after each page whether it needs another. These cap how far it goes."
          >
            <ResearchSettings />
          </Panel>
          <Panel
            id="do-not-contact"
            title="Do not contact"
            description="Never found, made a lead, or written to, in any workspace. Companies are matched by website, phone, Google listing or name and city; people by email or its domain."
          >
            <ExclusionsSettings />
          </Panel>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel title="Spend this month" description={usage.error ? `Couldn't load spend: ${usage.error}` : "Claude, Apollo and Apify, from the Usage page. Resets on the 1st."}>
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] leading-9 tabular-nums">{formatUsd(spent)}</span>
            <span className="text-sm text-muted-foreground tabular-nums">of {formatUsd(settings.monthlyBudgetUsd)}</span>
            <span className="ml-auto text-sm text-muted-foreground tabular-nums">{Math.round(ratio * 100)}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", over ? "bg-negative" : near ? "bg-warning" : "bg-data")}
              style={{ width: `${Math.min(100, ratio * 100)}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>$0</span>
            <span>{formatUsd(settings.monthlyBudgetUsd)}</span>
          </div>
          {near && (
            <p className={cn("mt-4 flex items-center gap-2 text-sm", over ? "text-negative" : "text-warning")}>
              <AlertTriangle className="size-4 flex-none" />
              {over
                ? "You're over this month's budget. Runs still show their cost before starting."
                : `You've used over ${WARN_AT * 100}% of this month's budget. ${formatUsd(remaining)} left.`}
            </p>
          )}
          </Panel>
          <Panel title="Defaults" description="Used by new prompts and every enrichment run.">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (valid && dirty) save()
            }}
          >
            <div className="space-y-1.5">
              <Label>Default model</Label>
              <Select value={draft.defaultModel} onValueChange={(v) => setDraft((d) => ({ ...d, defaultModel: v }))}>
                <SelectTrigger className="w-full!" aria-label="Default model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {numberField("postsPerLead", "Posts per lead", "Fetched per source.")}
              {numberField("maxPostAgeDays", "Max post age (days)", "Older posts are ignored.")}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {numberField("monthlyBudgetUsd", "Monthly budget (USD)", "You'll see a warning past 80%.")}
              {numberField("prospectorRunLimitUsd", "Most a Prospector's run may spend (USD)", "Each LinkedIn search they start stops here. Admins only.")}
            </div>
            <div className="flex justify-end pt-1">
              <Button type="submit" disabled={!valid || !dirty}>
                Save settings
              </Button>
            </div>
          </form>
          </Panel>
          <Panel title="API connections" description="The services the backend uses. Each one's key is set in the backend's .env file, not here.">
          <ul className="-my-3 divide-y divide-rule">
            {CONNECTIONS.map((c) => (
              <li key={c.name} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="truncate text-[13px] text-muted-foreground">{c.purpose}</p>
                </div>
                <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{c.env}</code>
              </li>
            ))}
          </ul>
          </Panel>
        </div>
      </div>
    </>
  )
}
