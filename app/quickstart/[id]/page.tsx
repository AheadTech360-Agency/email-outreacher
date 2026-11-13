"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Check, ChevronDown, Circle, Loader2, Minus, Play, Rocket, Send, Square, X } from "lucide-react"
import { toast } from "sonner"
import { BackendError, WorkspaceGate } from "@/components/companies/backend-state"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { ManagerOnly } from "@/components/manager-only"
import { safeHref } from "@/components/column-picker"
import { RunPeople } from "@/components/quickstart/run-people"
import { usePlain } from "@/components/say"
import { PageHeader } from "@/components/page-header"
import { RUN_STATUS } from "@/components/quickstart/run-status"
import { Pill, type PillTone } from "@/components/status"
import { TableSkeleton } from "@/components/table-skeleton"
import { Button } from "@/components/ui/button"
import {
  type CompanyBrief,
  type QuickstartDetail,
  type QuickstartStepKey,
  fetchQuickstartBriefs,
  fetchQuickstartRun,
  queueEmails,
  decideCompanies,
  resumeQuickstart,
  runWhere,
  stopQuickstart,
  updateEmail,
  useApi,
} from "@/lib/api"
import { confirmKind, confirmNote, needsConfirm } from "@/lib/email-status"
import { formatUsd, shortDate } from "@/lib/format"
import { cn } from "@/lib/utils"

const STEPS: { key: QuickstartStepKey; label: string; what: string }[] = [
  { key: "find", label: "Find companies", what: "A Google Maps or LinkedIn search, or the companies you already have" },
  { key: "google", label: "Search the web", what: "Each company's website, Instagram and Facebook, where LinkedIn didn't give them (Brave, or Google through Apify)" },
  { key: "research", label: "Verify companies", what: "Reads each website and Instagram, checks the ICP's rule, scores the fit" },
  { key: "website", label: "Read websites", what: "The websites not read yet: free, no AI" },
  { key: "people", label: "Fetch LinkedIn profiles", what: "Where no one has a verified email yet: LinkedIn profiles at the qualified companies, with work emails" },
  { key: "leads", label: "Make leads", what: "The people to write to; anyone already contacted is skipped" },
  { key: "profiles", label: "Fill in profiles", what: "Their LinkedIn profiles and their company's LinkedIn page and Instagram, where not read yet" },
  { key: "posts", label: "Read their posts", what: "Their recent LinkedIn and Instagram posts, for the opening line" },
  { key: "write", label: "Write emails", what: "One email each, from your templates; they wait for your review" },
  { key: "analysis", label: "Analyse companies and people", what: "On each qualified company and its people: what they do, what they post, the hooks to use" },
]

/** A Prospector's steps: what each does, not which tool does it. */
const PLAIN_STEPS: Partial<Record<QuickstartStepKey, { label?: string; what: string }>> = {
  find: { what: "Companies matching your search words" },
  google: { what: "Each company's website, Instagram and Facebook, where they're missing" },
  research: { what: "Reads each website, checks the ICP's rule, scores the fit" },
  people: { label: "Find people", what: "The people at the qualified companies, with their work emails where found" },
  posts: { what: "Their recent posts, for the hooks" },
}
const COMPANY: Record<string, { label: string; tone: PillTone }> = {
  found: { label: "To verify", tone: "neutral" },
  review: { label: "To approve", tone: "warning" },
  qualified: { label: "Qualified", tone: "positive" },
  not_fit: { label: "Not a fit", tone: "warning" },
  error: { label: "Couldn't finish", tone: "negative" },
}
const DRAFT: Record<string, { label: string; tone: PillTone }> = {
  draft: { label: "To review", tone: "info" },
  edited: { label: "To review", tone: "info" },
  approved: { label: "Approved", tone: "positive" },
  queued: { label: "Queued", tone: "positive" },
  sent: { label: "Sent", tone: "neutral" },
  skipped: { label: "Skipped", tone: "neutral" },
}

const emailPill = (status: string | null): { label: string; tone: PillTone } =>
  status === "valid"
    ? { label: "Valid email", tone: "positive" }
    : status === "risky"
      ? { label: "Risky email", tone: "warning" }
      : status === "website"
        ? { label: "Website email", tone: "warning" }
        : { label: status ? `Email: ${status}` : "No email", tone: "neutral" }

export default function QuickstartRunPage() {
  const { id } = useParams<{ id: string }>()
  return <WorkspaceGate>{(wsId) => <Run key={wsId} wsId={wsId} runId={id} />}</WorkspaceGate>
}

function Run({ wsId, runId }: { wsId: string; runId: string }) {
  const run = useApi(() => fetchQuickstartRun(wsId, runId), [wsId, runId])
  const live = run.data?.status === "queued" || run.data?.status === "running"
  const { reload } = run
  // While it works, the page follows it every few seconds, but only while it's on screen: a tab left open in the
  // background would otherwise read the whole run from the database every few seconds for nothing.
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") reload()
    }, 5000)
    const back = () => {
      if (document.visibilityState === "visible") reload()
    }
    document.addEventListener("visibilitychange", back)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", back)
    }
  }, [live, reload])

  if (run.error && !run.data && /not found/i.test(run.error))
    return (
      <div className="px-4 py-10 md:px-8">
        <EmptyState
          icon={Rocket}
          title="This run doesn't exist"
          description="It may belong to another workspace."
          action={
            <Button asChild variant="outline">
              <Link href="/quickstart">Back to Quick Start</Link>
            </Button>
          }
        />
      </div>
    )
  if (run.error && !run.data) return <BackendError message={run.error} onRetry={run.reload} />
  if (!run.data) return <TableSkeleton rows={6} />
  const r = run.data

  return (
    <>
      <PageHeader
        title={`Quick Start: ${r.icpName}`}
        description={`${runWhere(r.settings)} · started ${shortDate(r.createdAt)}`}
        actions={<Controls wsId={wsId} run={r} live={live} onChanged={run.reload} />}
      />
      <div className="space-y-8 px-4 pb-10 md:px-8">
        <Summary run={r} />
        <Steps run={r} />
        {r.settings.source === "linkedin" ? <Briefs wsId={wsId} run={r} /> : <Drafts wsId={wsId} run={r} onChanged={run.reload} />}
        <Companies wsId={wsId} run={r} onChanged={run.reload} />
        <RunPeople wsId={wsId} run={r} />
        <p className="text-sm">
          <Link href="/quickstart" className="underline">
            Back to Quick Start
          </Link>
        </p>
      </div>
    </>
  )
}

function Controls({ wsId, run, live, onChanged }: { wsId: string; run: QuickstartDetail; live: boolean; onChanged: () => void }) {
  const [confirmStop, setConfirmStop] = useState(false)
  const act = (call: Promise<unknown>, done: string) =>
    call
      .then(() => {
        toast.success(done)
        onChanged()
      })
      .catch((e: unknown) => toast.error("Couldn't do that", { description: e instanceof Error ? e.message : undefined }))
  if (run.status === "waiting") {
    const left = run.companies.filter((c) => c.status === "review").length
    return (
      <div className="flex gap-2">
        <ManagerOnly runner>
          <Button
            disabled={left > 0}
            title={left ? `Approve or reject the ${left} below first` : undefined}
            onClick={() => void act(resumeQuickstart(wsId, run.id), "Continuing with the approved companies")}
          >
            <Play /> Continue
          </Button>
        </ManagerOnly>
        <ManagerOnly runner>
          <Button variant="outline" onClick={() => void act(stopQuickstart(wsId, run.id), "Stopped")}>
            <Square /> Stop
          </Button>
        </ManagerOnly>
      </div>
    )
  }
  // It ended with companies waiting (nobody qualified then); once some are approved, it can go on with them.
  const approvedSince =
    run.status === "done" && (run.steps.people?.state ?? "skipped") === "skipped" && run.companies.some((c) => c.status === "qualified")
  if (approvedSince)
    return (
      <ManagerOnly runner>
        <Button onClick={() => void act(resumeQuickstart(wsId, run.id), "Continuing with the approved companies")}>
          <Play /> Continue with the approved
        </Button>
      </ManagerOnly>
    )
  if (run.status === "failed")
    return (
      <ManagerOnly runner>
        <Button onClick={() => void act(resumeQuickstart(wsId, run.id), "Trying that step again")}>
          <Play /> Try again
        </Button>
      </ManagerOnly>
    )
  if (!live) return null
  return (
    <div className="flex gap-2">
      <ManagerOnly runner>
        <Button
          variant="outline"
          title="Use this if it hasn't moved for several minutes (the worker restarted)."
          onClick={() => void act(resumeQuickstart(wsId, run.id), "Picked up again")}
        >
          <Play /> Resume
        </Button>
      </ManagerOnly>
      <ManagerOnly runner>
        <Button variant="outline" onClick={() => setConfirmStop(true)}>
          <Square /> Stop
        </Button>
      </ManagerOnly>
      <ConfirmDialog
        open={confirmStop}
        onOpenChange={setConfirmStop}
        title="Stop this run?"
        description="It stops after the batch it's on. Everything it made so far stays: companies, leads and drafts."
        confirmLabel="Stop it"
        onConfirm={() => {
          setConfirmStop(false)
          void act(stopQuickstart(wsId, run.id), "Stopping after this batch")
        }}
      />
    </div>
  )
}

function Summary({ run }: { run: QuickstartDetail }) {
  const c = run.companies
  const l = run.leads
  const d = run.drafts
  const tiles = [
    {
      label: "Companies",
      value: c.filter((x) => x.status === "qualified").length,
      unit: "qualified",
      rest: `${c.filter((x) => x.status === "not_fit").length} not a fit · ${c.filter((x) => x.status === "found").length} to verify`,
    },
    {
      label: "Leads",
      value: l.length,
      unit: "leads",
      rest: `${l.filter((x) => x.emailStatus === "valid").length} valid · ${l.filter((x) => x.emailStatus === "website").length} from websites · ${l.filter((x) => x.emailStatus === "risky").length} risky`,
    },
    run.settings.source === "linkedin"
      ? { label: "Briefs", value: run.steps.analysis?.done ?? 0, unit: "companies", rest: "With the hooks to use" }
      : {
          label: "Emails",
          value: d.filter((x) => x.status === "draft" || x.status === "edited").length,
          unit: "to review",
          rest: `${d.filter((x) => x.status === "approved").length} approved · ${d.filter((x) => x.status === "queued" || x.status === "sent").length} queued`,
        },
    {
      label: "Spent",
      value: formatUsd(run.spentUsd),
      unit: `of ${formatUsd(run.spendLimitUsd)}`,
      rest: "Stops at the limit",
    },
  ]
  const status = RUN_STATUS[run.status]
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Pill tone={status.tone}>{status.label}</Pill>
        {run.detail && <p className="text-sm">{run.detail}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {t.value} <span className="text-sm font-normal text-muted-foreground">{t.unit}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">{t.rest}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Steps({ run }: { run: QuickstartDetail }) {
  const plain = usePlain()
  const steps = plain ? STEPS.map((s) => ({ ...s, ...PLAIN_STEPS[s.key] })) : STEPS
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Steps</h2>
      <ol className="divide-y divide-rule rounded-lg border">
        {(run.stepOrder?.length ? steps.filter((s) => run.stepOrder!.includes(s.key)) : steps.filter((s) => s.key !== "website" && s.key !== "profiles")).map((s, i) => {
          const step = run.steps[s.key]
          const state = step?.state ?? "waiting"
          const Icon = { waiting: Circle, running: Loader2, done: Check, skipped: Minus, failed: X }[state]
          const pct = step?.total ? Math.min(100, Math.round((step.done / step.total) * 100)) : state === "done" ? 100 : 0
          return (
            <li key={s.key} className="flex gap-3 px-4 py-3">
              <Icon
                className={cn(
                  "mt-0.5 size-4 flex-none",
                  state === "running" && "animate-spin text-primary",
                  state === "done" && "text-positive",
                  state === "failed" && "text-destructive",
                  (state === "waiting" || state === "skipped") && "text-muted-foreground",
                )}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium">
                  {i + 1}. {s.label}
                  {state === "skipped" && <span className="font-normal text-muted-foreground"> · skipped</span>}
                </p>
                <p className="text-xs text-muted-foreground">{step?.note || s.what}</p>
                {(state === "running" || (state === "done" && step?.total)) && (
                  <div className="h-1.5 w-full max-w-sm overflow-hidden rounded bg-muted">
                    <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
              {step?.total ? (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {step.done} of {step.total}
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Drafts({ wsId, run, onChanged }: { wsId: string; run: QuickstartDetail; onChanged: () => void }) {
  const [busy, setBusy] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [includeRisky, setIncludeRisky] = useState(false)
  const drafts = run.drafts
  const toReview = drafts.filter((d) => d.status === "draft" || d.status === "edited")
  const approved = drafts.filter((d) => d.status === "approved")
  const risky = approved.filter((d) => needsConfirm(d.emailStatus))
  const safeToApprove = toReview.filter((d) => d.email && !needsConfirm(d.emailStatus))

  const setStatus = async (ids: string[], status: "approved" | "skipped" | "draft") => {
    setBusy(ids.length === 1 ? ids[0] : "all")
    const results = await Promise.allSettled(ids.map((id) => updateEmail(wsId, id, { status })))
    const failed = results.filter((x) => x.status === "rejected").length
    if (failed) toast.error(`${failed} couldn't be changed`)
    setBusy("")
    onChanged()
  }

  const queue = async () => {
    const ids = approved.filter((d) => includeRisky || !needsConfirm(d.emailStatus)).map((d) => d.id)
    if (!ids.length) return
    setBusy("queue")
    try {
      const r = await queueEmails(wsId, ids, includeRisky ? risky.map((d) => d.id) : [])
      const skipped = r.results.filter((x) => x.status === "skipped")
      const warnings = [...new Set(r.results.filter((x) => x.status === "queued" && x.reason).map((x) => x.reason))].join(" ")
      if (warnings) toast.warning("Queued, but the campaign needs attention", { description: warnings })
      if (r.queued)
        toast.success(`${r.queued} queued in CheapSequencer`, {
          description: `Sending has started on the campaign's schedule.${skipped.length ? ` ${skipped.length} skipped: ${[...new Set(skipped.map((x) => x.reason))].slice(0, 2).join(" ")}` : ""}`,
        })
      else toast.error("None were queued", { description: [...new Set(skipped.map((x) => x.reason))].slice(0, 2).join(" ") || undefined })
    } catch (e) {
      toast.error("Couldn't queue them", { description: e instanceof Error ? e.message : undefined })
    }
    setBusy("")
    onChanged()
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-semibold">
          Emails <span className="font-normal text-muted-foreground">({toReview.length} to review)</span>
        </h2>
        {safeToApprove.length > 0 && (
          <Button variant="outline" size="sm" disabled={!!busy} onClick={() => void setStatus(safeToApprove.map((d) => d.id), "approved")}>
            <Check /> Approve all with a valid email ({safeToApprove.length})
          </Button>
        )}
        {approved.length > 0 && (
          <Button size="sm" disabled={!!busy} onClick={() => setConfirming(true)}>
            <Send /> Queue {approved.length} approved
          </Button>
        )}
      </div>
      {drafts.length === 0 ? (
        <p className="rounded-lg border px-4 py-6 text-sm text-muted-foreground">
          Emails show up here as they&apos;re written, ready for you to approve.
        </p>
      ) : (
        <div className="divide-y divide-rule rounded-lg border">
          {drafts.map((d) => {
            const open = openId === d.id
            const email = emailPill(d.emailStatus)
            const status = DRAFT[d.status] ?? { label: d.status, tone: "neutral" as PillTone }
            const reviewable = d.status === "draft" || d.status === "edited"
            return (
              <div key={d.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpenId(open ? null : d.id)}>
                    <ChevronDown className={cn("size-4 flex-none transition-transform", !open && "-rotate-90")} />
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {d.leadName} <span className="font-normal text-muted-foreground">· {d.company}</span>
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">{d.subject}</span>
                    </span>
                  </button>
                  <Pill tone={email.tone}>{email.label}</Pill>
                  {d.score !== null && <span className="text-xs tabular-nums text-muted-foreground">Score {d.score}</span>}
                  <Pill tone={status.tone}>{status.label}</Pill>
                  {reviewable && (
                    <>
                      <Button size="sm" disabled={!!busy || !d.email} onClick={() => void setStatus([d.id], "approved")}>
                        <Check /> Approve
                      </Button>
                      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void setStatus([d.id], "skipped")}>
                        <X /> Skip
                      </Button>
                    </>
                  )}
                  {(d.status === "approved" || d.status === "skipped") && (
                    <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void setStatus([d.id], "draft")}>
                      Back to review
                    </Button>
                  )}
                </div>
                {open && (
                  <div className="mt-3 space-y-2 pl-6">
                    <p className="text-xs text-muted-foreground">
                      To {d.email ?? "no email address"}
                      {needsConfirm(d.emailStatus) && ` · ${confirmNote(d.emailStatus)}`}
                    </p>
                    <p className="text-sm font-medium">{d.subject}</p>
                    <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">{d.body}</p>
                    <p className="text-xs">
                      To edit, rate or rewrite it,{" "}
                      <Link href={`/icps/${run.icpId}/review?email=${encodeURIComponent(d.id)}`} className="underline">
                        open it in Review
                      </Link>
                      .
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Queue ${approved.length - (includeRisky ? 0 : risky.length)} approved emails?`}
        description="This starts sending. Each lead goes into the ICP's campaign in CheapSequencer and their first email goes out on the campaign's schedule. A paused campaign stays paused."
        confirmLabel="Queue them"
        onConfirm={() => {
          setConfirming(false)
          void queue()
        }}
      >
        {risky.length > 0 && (
          <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <p>
              {risky.length === 1 ? "1 needs" : `${risky.length} need`} your OK first:{" "}
              {risky.map((d) => `${d.leadName} (${confirmKind(d.emailStatus)})`).join(", ")}.
            </p>
            {[...new Set(risky.map((d) => d.emailStatus))].map((s) => (
              <p key={s} className="text-xs">
                {confirmNote(s)}
              </p>
            ))}
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={includeRisky} onChange={(e) => setIncludeRisky(e.target.checked)} />
              Queue {risky.length === 1 ? "it" : "them"} too
            </label>
          </div>
        )}
      </ConfirmDialog>
    </section>
  )
}

/** The LinkedIn option's end result: a brief per qualified company, best score first. */
function Briefs({ wsId, run }: { wsId: string; run: QuickstartDetail }) {
  const done = run.steps.analysis?.done ?? 0
  const briefs = useApi(() => fetchQuickstartBriefs(wsId, run.id), [wsId, run.id, done])
  if (!done && !briefs.data?.length) return null
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Company and people analysis</h2>
        <p className="text-sm text-muted-foreground">
          What each qualified company is about, what they post, the hooks most likely to work, and how to approach each person there.
        </p>
      </div>
      {briefs.error && !briefs.data ? (
        <BackendError message={briefs.error} onRetry={briefs.reload} />
      ) : !briefs.data ? (
        <TableSkeleton rows={3} />
      ) : (
        <div className="space-y-3">
          {briefs.data.map((c, i) => (
            <BriefCard key={c.id} company={c} open={i < 3} />
          ))}
        </div>
      )}
    </section>
  )
}

function BriefCard({ company: c, open }: { company: CompanyBrief; open: boolean }) {
  const b = c.brief
  const links = [
    ["Website", c.websiteUrl ?? (c.domain ? `https://${c.domain}` : null)],
    ["LinkedIn", c.linkedinUrl],
    ["Instagram", c.instagramUrl],
    ["Facebook", c.facebookUrl],
  ].filter((l): l is [string, string] => !!l[1])
  const facts = [[c.city, c.state].filter(Boolean).join(", "), c.industry, c.employees ? `${c.employees.toLocaleString()} employees` : null].filter(Boolean)
  return (
    <details open={open} className="group rounded-lg border">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        <span className="font-medium">{c.name}</span>
        {c.score !== null && <Pill tone="positive">Score {c.score}</Pill>}
        <span className="text-xs text-muted-foreground">{facts.join(" · ")}</span>
      </summary>
      <div className="grid gap-5 border-t px-4 py-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4 text-sm">
          <p>{b.summary}</p>
          <p className="text-muted-foreground">{b.fit}</p>
          {b.hooks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Hooks to use</h3>
              <ol className="space-y-2">
                {b.hooks.map((h, i) => (
                  <li key={i} className="rounded-md bg-muted/40 px-3 py-2">
                    <p className="font-medium">{i + 1}. {h.hook}</p>
                    <p className="mt-0.5 text-muted-foreground">{h.why}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Based on: {h.evidence}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {b.signals.length > 0 && <BriefList title="Signals" items={b.signals} />}
          {b.cautions.length > 0 && <BriefList title="Be careful about" items={b.cautions} />}
        </div>
        <div className="space-y-4 text-sm">
          {links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {links.flatMap(([label, raw]) => {
                const href = safeHref(raw)
                return href ? [[label, href] as const] : []
              }).map(([label, href]) => (
                <a key={label} href={href} target="_blank" rel="noreferrer" className="rounded-md border px-2 py-1 text-xs hover:bg-muted">
                  {label}
                </a>
              ))}
            </div>
          )}
          <p className="text-muted-foreground">{b.online}</p>
          {b.posting_themes.length > 0 && <BriefList title="What they post about" items={b.posting_themes} />}
          {c.posts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Latest posts</h3>
              <ul className="space-y-2">
                {c.posts.map((p) => (
                  <li key={p.url} className="text-xs">
                    <a href={safeHref(p.url) ?? undefined} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                      {p.source === "instagram" ? "Instagram" : "LinkedIn"}, {p.whose === "person" ? "a person there" : "the company"}
                      {p.postedAt ? `, ${shortDate(p.postedAt)}` : ""}
                    </a>
                    <p className="mt-0.5 line-clamp-3 text-muted-foreground">{p.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!b.people?.length && b.best_contacts.length > 0 && <BriefList title="Who to email first" items={b.best_contacts} />}
        </div>
      </div>
      {b.people && b.people.length > 0 && <BriefPeople people={b.people} contacts={c.people ?? []} />}
    </details>
  )
}

/** Each person there, best to email first: who they are, how to approach them, an opening line, and how to reach them. */
function BriefPeople({ people, contacts }: { people: NonNullable<CompanyBrief["brief"]["people"]>; contacts: CompanyBrief["people"] }) {
  const reach = (name: string) => contacts.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase())
  return (
    <div className="space-y-2 border-t px-4 py-4 text-sm">
      <h3 className="text-sm font-semibold">People ({people.length})</h3>
      <ol className="grid gap-2 lg:grid-cols-2">
        {people.map((p, i) => {
          const contact = reach(p.name)
          const linkedin = safeHref(contact?.linkedinUrl)
          return (
            <li key={`${p.name}-${i}`} className="space-y-1 rounded-md bg-muted/40 px-3 py-2">
              <p className="font-medium">
                {i + 1}. {p.name}
                {p.title && <span className="font-normal text-muted-foreground"> · {p.title}</span>}
              </p>
              <p className="text-muted-foreground">{p.who}</p>
              <p>
                <span className="font-medium">Angle: </span>
                {p.angle}
              </p>
              <p>
                <span className="font-medium">Open with: </span>
                {p.opener}
              </p>
              <p className="text-xs text-muted-foreground">Based on: {p.evidence}</p>
              {(contact?.email || linkedin) && (
                <p className="flex flex-wrap gap-x-3 text-xs">
                  {contact?.email && <span>{contact.email}</span>}
                  {linkedin && (
                    <a href={linkedin} target="_blank" rel="noreferrer" className="hover:underline">
                      LinkedIn profile
                    </a>
                  )}
                </p>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  )
}

function Companies({ wsId, run, onChanged }: { wsId: string; run: QuickstartDetail; onChanged: () => void }) {
  const [busy, setBusy] = useState("")
  if (!run.companies.length) return null
  const waiting = run.companies.filter((c) => c.status === "review")
  const decide = async (ids: string[], status: "qualified" | "not_fit") => {
    setBusy(ids.length === 1 ? ids[0] : "all")
    try {
      await decideCompanies(wsId, ids, status)
      onChanged()
    } catch (e) {
      toast.error("Couldn't change it", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy("")
    }
  }
  return (
    <details className="group rounded-lg border" open={waiting.length > 0 || undefined}>
      <summary className="cursor-pointer px-4 py-3 text-base font-semibold">
        Companies ({run.companies.length})
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {run.companies.filter((c) => c.status === "qualified").length} qualified,{" "}
          {run.companies.filter((c) => c.status === "not_fit").length} not a fit
          {waiting.length > 0 && `, ${waiting.length} to approve`}
        </span>
      </summary>
      {waiting.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-t bg-warning/10 px-4 py-2 text-sm">
          <span>{waiting.length} under your approval threshold.</span>
          <ManagerOnly runner>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void decide(waiting.map((c) => c.id), "qualified")}>
              Approve all {waiting.length}
            </Button>
          </ManagerOnly>
          <ManagerOnly runner>
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void decide(waiting.map((c) => c.id), "not_fit")}>
              Reject all
            </Button>
          </ManagerOnly>
        </div>
      )}
      <div className="divide-y divide-rule border-t">
        {run.companies.map((c) => {
          const s = COMPANY[c.status] ?? { label: c.status, tone: "neutral" as PillTone }
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{c.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{c.reason || c.domain || ""}</span>
              </span>
              {c.score !== null && <span className="text-xs tabular-nums text-muted-foreground">Score {c.score}</span>}
              <Pill tone={s.tone}>{s.label}</Pill>
              {c.status === "review" && (
                <span className="flex gap-1">
                  <ManagerOnly runner>
                    <Button size="sm" variant="outline" className="h-7" disabled={!!busy} onClick={() => void decide([c.id], "qualified")}>
                      Approve
                    </Button>
                  </ManagerOnly>
                  <ManagerOnly runner>
                    <Button size="sm" variant="ghost" className="h-7" disabled={!!busy} onClick={() => void decide([c.id], "not_fit")}>
                      Reject
                    </Button>
                  </ManagerOnly>
                </span>
              )}
            </div>
          )
        })}
      </div>
    </details>
  )
}

