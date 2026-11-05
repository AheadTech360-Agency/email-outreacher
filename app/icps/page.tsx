"use client"

import { FacetFilters } from "@/components/facet-filters"
import { presenceMatches, textMatches, PRESENCE_OPTIONS } from "@/lib/facets"
import { Input } from "@/components/ui/input"

import Link from "next/link"
import { useState } from "react"
import { ArchiveFilter } from "@/components/archive-records"
import { ArrowRight, Plus, Target } from "lucide-react"
import { BackendError } from "@/components/companies/backend-state"
import { EmptyState } from "@/components/empty-state"
import { IcpLifecycleActions } from "@/components/icp-lifecycle-actions"
import { PageHeader } from "@/components/page-header"
import { ConfidenceBadge, Pill, PipelineStrip } from "@/components/status"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchEmails, useApi } from "@/lib/api"
import { flagLabel } from "@/lib/format"
import { pipeline } from "@/lib/selectors"
import { useStore } from "@/lib/store"

const LOW_CONFIDENCE = 60

export default function IcpsPage() {
  const { icps, icpsStatus, icpsError, reloadIcps, workspacesStatus, leads, settings, currentWorkspaceId } = useStore()
  const loading = icpsStatus === "loading" || workspacesStatus === "loading"
  const emails = useApi(() => (currentWorkspaceId ? fetchEmails(currentWorkspaceId) : Promise.resolve([])), [currentWorkspaceId])

  const [archiveFilter, setArchiveFilter] = useState("active")
  const [extra, setExtra] = useState<Record<string,string>>({})
  const rows = icps.filter((icp) => archiveFilter === "all" || (archiveFilter === "archived" ? !icp.enabled : icp.enabled)).map((icp) => {
    const icpLeads = leads.filter((l) => l.icpId === icp.id)
    return { icp, leads: icpLeads, counts: pipeline(icpLeads) }
  }).filter(({icp,leads:icpLeads,counts}) => textMatches(extra.query,icp.name,icp.industry) &&
    presenceMatches(icpLeads.length,extra.leads) && presenceMatches(counts.review,extra.review))
  const toReview = rows.reduce((sum, r) => sum + r.counts.review, 0)
  const waiting = rows.filter((r) => r.counts.review > 0).length
  const notEnriched = rows.reduce((sum, r) => sum + r.counts.pending, 0)

  // Unsent drafts that are flagged, unsure, or scored under the auto-send threshold, weakest first.
  const threshold = settings.scoring.threshold
  const attention = (emails.data ?? [])
    .filter(
      (e) =>
        (e.status === "draft" || e.status === "edited") &&
        (e.flags.length > 0 || e.confidence < LOW_CONFIDENCE || (e.score !== null && e.score < threshold)),
    )
    .map((e) => ({ email: e, icpName: icps.find((i) => i.id === e.lead.icpId)?.name ?? "No ICP" }))
    .sort((a, b) => (a.email.score ?? a.email.confidence) - (b.email.score ?? b.email.confidence))

  const nextRuns = rows.map(({ icp, leads: icpLeads }) => ({
    icp,
    fetch: icpLeads.filter((l) => l.status === "imported" || l.status === "failed").length,
    draft: icpLeads.filter((l) => l.status === "enriched" || l.status === "no_content").length,
  }))

  const newButton = (
    <Button asChild>
      <Link href="/icps/new">
        <Plus /> New ICP
      </Link>
    </Button>
  )

  return (
    <>
      <PageHeader
        title="ICPs"
        description={
          toReview > 0
            ? `${toReview} drafts waiting for review in ${waiting} ICP${waiting === 1 ? "" : "s"} · ${notEnriched} leads not enriched yet`
            : "Who you're looking for. Outreach settings for each are kept per workspace."
        }
        actions={newButton}
      />
      <div className="px-4 pb-8 md:px-8">
        <div className="mb-4"><ArchiveFilter value={archiveFilter} onChange={setArchiveFilter} /></div>
        <div className="mb-4 space-y-3"><Input aria-label="Search ICPs" placeholder="Search ICP name or industry" value={extra.query ?? ""} onChange={(e)=>setExtra({...extra,query:e.target.value})} />
          <FacetFilters values={extra} onChange={setExtra} count={rows.length} fields={[{key:"leads",label:"Leads in pipeline",options:PRESENCE_OPTIONS},{key:"review",label:"Emails awaiting review",options:PRESENCE_OPTIONS}]} /></div>
        {icpsStatus === "error" ? (
          <BackendError message={icpsError ?? ""} onRetry={reloadIcps} />
        ) : loading ? (
          <div className="space-y-px overflow-hidden rounded-lg border">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[104px] rounded-none" />
            ))}
          </div>
        ) : icps.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No ICPs yet"
            description="Add one to say who you're looking for, then find companies for it."
            action={newButton}
          />
        ) : (
          <ul className="divide-y divide-rule overflow-hidden rounded-lg border">
            {rows.map(({ icp, leads: icpLeads, counts }) => (
              <li
                key={icp.id}
                className="grid gap-x-8 gap-y-4 px-5 py-5 transition-colors hover:bg-muted/60 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <Link
                    href={`/icps/${icp.id}`}
                    className="block truncate text-[15px] font-semibold hover:underline focus-visible:underline focus-visible:outline-none"
                  >
                    {icp.name}
                  </Link>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Pill>{icp.industry}</Pill>
                    {!icp.enabled && <Pill tone="warning">Archived</Pill>}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {icp.companyCount.toLocaleString()} {icp.companyCount === 1 ? "business" : "businesses"}
                      {icp.places.length ? ` · ${icp.places.slice(0, 2).join(", ")}` : ""}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-xs text-muted-foreground">
                    {icp.titles.length ? `Reach: ${icp.titles.slice(0, 3).join(", ")}` : "Who to reach isn't set yet"}
                  </p>
                </div>
                <div className="min-w-0">
                  <div className="mb-2 flex items-baseline justify-between text-xs text-muted-foreground">
                    <span>Pipeline</span>
                    <span className="tabular-nums">
                      <span className="text-foreground">{icpLeads.length}</span> leads
                    </span>
                  </div>
                  <PipelineStrip leads={icpLeads} />
                </div>
                <div className="flex items-center justify-between gap-5 lg:justify-end">
                  <div className="text-right">
                    <div className="text-[28px] leading-8 font-normal tabular-nums">{counts.review}</div>
                    <div className="text-xs text-muted-foreground">to review</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild variant={counts.review > 0 ? "default" : "outline"} size="sm">
                      <Link href={counts.review > 0 ? `/icps/${icp.id}/review` : `/icps/${icp.id}/leads`}>
                        {counts.review > 0 ? "Review" : "Open"} <ArrowRight />
                      </Link>
                    </Button>
                    <IcpLifecycleActions icp={icp} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!loading && icpsStatus !== "error" && icps.length > 0 && (
          <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
            <section className="flex flex-col rounded-lg border">
              <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-5 pt-4 pb-2">
                <h2 className="text-[15px] font-semibold">Needs a closer look</h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {emails.loading
                    ? "Loading drafts…"
                    : `${attention.length} draft${attention.length === 1 ? "" : "s"} flagged, unsure or under ${threshold}`}
                </span>
              </header>
              {emails.error ? (
                <p className="px-5 pb-4 text-sm text-muted-foreground">Couldn&apos;t load drafts: {emails.error}</p>
              ) : emails.loading ? (
                <div className="space-y-2 px-5 pb-4">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ) : attention.length === 0 ? (
                <p className="px-5 pb-4 text-sm text-muted-foreground">
                  Every draft waiting for review is unflagged, confident and scores {threshold} or more.
                </p>
              ) : (
                <ul className="divide-y divide-rule pb-1">
                  {attention.slice(0, 3).map(({ email, icpName }) => (
                    <li key={email.id}>
                      <Link
                        href={`${email.lead.icpId ? `/icps/${email.lead.icpId}/review` : "/review"}?email=${encodeURIComponent(email.id)}`}
                        className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/60"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {`${email.lead.firstName} ${email.lead.lastName}`.trim() || email.lead.email}
                          </div>
                          <div className="truncate text-[13px] text-muted-foreground">
                            {email.lead.company} · {icpName}
                          </div>
                        </div>
                        {email.flags[0] ? (
                          <Pill tone={email.flags[0] === "sensitive_topic" ? "negative" : "warning"}>{flagLabel(email.flags[0])}</Pill>
                        ) : email.confidence < LOW_CONFIDENCE ? (
                          <Pill tone="warning">Low confidence</Pill>
                        ) : (
                          <Pill tone="warning">Low score</Pill>
                        )}
                        {email.score !== null ? (
                          <span className="w-8 text-right text-sm tabular-nums">{email.score}</span>
                        ) : (
                          <ConfidenceBadge value={email.confidence} />
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {attention.length > 3 && (
                <p className="mt-auto border-t border-rule px-5 py-2.5 text-[13px] text-muted-foreground">
                  {attention.length - 3} more in the ICPs&apos; Review tabs, under Show only &gt; Flagged or Low confidence.
                </p>
              )}
            </section>

            <section className="flex flex-col rounded-lg border">
              <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-5 pt-4 pb-2">
                <h2 className="text-[15px] font-semibold">Ready to run</h2>
                <span className="text-xs text-muted-foreground">Leads waiting at each step</span>
              </header>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-5 pb-2 font-normal">ICP</th>
                    <th className="px-3 pb-2 text-right font-normal">Posts to fetch</th>
                    <th className="px-5 pb-2 text-right font-normal">Emails to write</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule border-t border-rule">
                  {nextRuns.map(({ icp, fetch, draft }) => (
                    <tr key={icp.id}>
                      <td className="w-full max-w-0 px-5 py-3.5">
                        <Link href={`/icps/${icp.id}/leads`} className="block truncate font-medium hover:underline">
                          {icp.name}
                        </Link>
                      </td>
                      <RunCell count={fetch} className="px-3" />
                      <RunCell count={draft} className="px-5" />
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t">
                  <tr>
                    <td className="px-5 py-2.5 text-muted-foreground">Total</td>
                    <RunCell count={nextRuns.reduce((n, r) => n + r.fetch, 0)} className="px-3" />
                    <RunCell count={nextRuns.reduce((n, r) => n + r.draft, 0)} className="px-5" />
                  </tr>
                </tfoot>
              </table>
              <p className="mt-auto border-t border-rule px-5 py-2.5 text-[13px] text-muted-foreground">
                Runs start from each ICP&apos;s Leads tab. Fetching posts shows its cost ceiling first.
              </p>
            </section>
          </div>
        )}
      </div>
    </>
  )
}

function RunCell({ count, className }: { count: number; className?: string }) {
  return (
    <td className={`py-3.5 text-right whitespace-nowrap tabular-nums ${className ?? ""}`}>
      {count || <span className="text-muted-foreground">–</span>}
    </td>
  )
}
