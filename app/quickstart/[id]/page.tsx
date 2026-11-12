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
import { PageHeader } from "@/components/page-header"
import { RUN_STATUS } from "@/components/quickstart/run-status"
import { Pill, type PillTone } from "@/components/status"
import { TableSkeleton } from "@/components/table-skeleton"
import { Button } from "@/components/ui/button"
import {
  type QuickstartDetail,
  type QuickstartStepKey,
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
  { key: "find", label: "Find companies", what: "A Google Maps search, or the companies you already have" },
  { key: "research", label: "Verify companies", what: "Reads each website and Instagram, checks the ICP's rule, scores the fit" },
  { key: "website", label: "Read websites", what: "The websites not read yet: free, no AI" },
  { key: "people", label: "Fetch LinkedIn profiles", what: "Where no one has a verified email yet: LinkedIn profiles at the qualified companies, with work emails" },
  { key: "leads", label: "Make leads", what: "The people to write to; anyone already contacted is skipped" },
  { key: "profiles", label: "Fill in profiles", what: "Their LinkedIn profiles and their company's LinkedIn page and Instagram, where not read yet" },
  { key: "posts", label: "Read their posts", what: "Their recent LinkedIn and Instagram posts, for the opening line" },
  { key: "write", label: "Write emails", what: "One email each, from your templates; they wait for your review" },
]
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
        <Drafts wsId={wsId} run={r} onChanged={run.reload} />
        <Companies wsId={wsId} run={r} onChanged={run.reload} />
        <Leads run={r} />
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
        <ManagerOnly>
          <Button
            disabled={left > 0}
            title={left ? `Approve or reject the ${left} below first` : undefined}
            onClick={() => void act(resumeQuickstart(wsId, run.id), "Continuing with the approved companies")}
          >
            <Play /> Continue
          </Button>
        </ManagerOnly>
        <ManagerOnly>
          <Button variant="outline" onClick={() => void act(stopQuickstart(wsId, run.id), "Stopped")}>
            <Square /> Stop
          </Button>
        </ManagerOnly>
      </div>
    )
  }
  if (run.status === "failed")
    return (
      <ManagerOnly>
        <Button onClick={() => void act(resumeQuickstart(wsId, run.id), "Trying that step again")}>
          <Play /> Try again
        </Button>
      </ManagerOnly>
    )
  if (!live) return null
  return (
    <div className="flex gap-2">
      <ManagerOnly>
        <Button
          variant="outline"
          title="Use this if it hasn't moved for several minutes (the worker restarted)."
          onClick={() => void act(resumeQuickstart(wsId, run.id), "Picked up again")}
        >
          <Play /> Resume
        </Button>
      </ManagerOnly>
      <ManagerOnly>
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
    {
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
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">Steps</h2>
      <ol className="divide-y divide-rule rounded-lg border">
        {(run.stepOrder?.length ? STEPS.filter((s) => run.stepOrder!.includes(s.key)) : STEPS.filter((s) => s.key !== "website" && s.key !== "profiles")).map((s, i) => {
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
          <ManagerOnly>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void decide(waiting.map((c) => c.id), "qualified")}>
              Approve all {waiting.length}
            </Button>
          </ManagerOnly>
          <ManagerOnly>
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
                  <ManagerOnly>
                    <Button size="sm" variant="outline" className="h-7" disabled={!!busy} onClick={() => void decide([c.id], "qualified")}>
                      Approve
                    </Button>
                  </ManagerOnly>
                  <ManagerOnly>
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

function Leads({ run }: { run: QuickstartDetail }) {
  if (!run.leads.length) return null
  return (
    <details className="group rounded-lg border">
      <summary className="cursor-pointer px-4 py-3 text-base font-semibold">
        Leads ({run.leads.length})
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {run.leads.filter((l) => l.emailStatus === "valid").length} valid, {run.leads.filter((l) => l.emailStatus === "website").length} from websites,{" "}
          {run.leads.filter((l) => l.emailStatus === "risky").length} risky
        </span>
      </summary>
      <div className="divide-y divide-rule border-t">
        {run.leads.map((l) => {
          const email = emailPill(l.emailStatus)
          return (
            <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {l.name} <span className="font-normal text-muted-foreground">{l.title && `· ${l.title}`}</span>
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {l.company} · {l.email ?? "no email"}
                </span>
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">{l.posts} posts</span>
              <Pill tone={email.tone}>{email.label}</Pill>
            </div>
          )
        })}
      </div>
    </details>
  )
}
