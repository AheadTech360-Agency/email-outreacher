"use client"

import { FacetFilters } from "@/components/facet-filters"
import { choices, presenceMatches, PRESENCE_OPTIONS } from "@/lib/facets"
import { useState } from "react"
import { AlertTriangle, Mails, RotateCw, Search, Sparkles, Wand2 } from "lucide-react"
import { toast } from "sonner"
import { BackendError } from "@/components/companies/backend-state"
import { EmptyState } from "@/components/empty-state"
import { CampaignReadinessPanel } from "@/components/mailboxes/campaign-readiness"
import { ManagerOnly } from "@/components/manager-only"
import { PageHeader } from "@/components/page-header"
import { Pill, type PillTone } from "@/components/status"
import { TableSkeleton } from "@/components/table-skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { type Mailbox, type Mailboxes, fetchMailboxes, fetchSendingCampaigns, runFollowUps, syncCampaigns, useApi } from "@/lib/api"
import { formatUsd, shortDate } from "@/lib/format"
import { useStore } from "@/lib/store"

const WARMUP_LABEL: Record<string, { label: string; tone: PillTone }> = {
  warming: { label: "Warming up", tone: "info" },
  warm: { label: "Warm", tone: "positive" },
  ready: { label: "Ready", tone: "positive" },
  paused: { label: "Paused", tone: "warning" },
}

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "–")

function ago(iso: string | null): string {
  if (!iso) return "–"
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`
  return shortDate(iso)
}

/** The 16 sending mailboxes as CheapSequencer runs them, with their domains' health. Read-only. */
export function MailboxesView() {
  const data = useApi(fetchMailboxes, [])
  const [query, setQuery] = useState("")
  const [domain, setDomain] = useState("all")
  const [extra, setExtra] = useState<Record<string, string>>({})

  const d = data.data
  const q = query.trim().toLowerCase()
  const shown = (d?.mailboxes ?? []).filter(
    (m) => (!extra.provider || extra.provider === "all" || m.provider === extra.provider) &&
      (!extra.status || extra.status === "all" || m.status === extra.status) &&
      (!extra.auth || extra.auth === "all" || m.authStatus === extra.auth) &&
      presenceMatches(m.needsAttention, extra.attention) &&
      presenceMatches(m.warmupEnabled, extra.warmup) &&
      (domain === "all" || m.domain === domain) && (!q || `${m.name} ${m.email}`.toLowerCase().includes(q)),
  )
  const s = d?.summary
  const domains = d?.domains ?? []

  return (
    <>
      <PageHeader
        title="Mailboxes"
        description="The inboxes your campaigns send from, as CheapSequencer runs them. Read-only here: settings change in CheapSequencer."
        actions={
          <Button variant="outline" onClick={data.reload} disabled={data.loading}>
            <RotateCw /> Refresh
          </Button>
        }
      />
      <div className="space-y-6 px-4 pb-10 md:px-8">
        {data.error && !d ? (
          <BackendError message={data.error} onRetry={data.reload} />
        ) : (
          <>
            {d?.errors.map((e) => (
              <p key={e} className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 flex-none text-warning" /> {e}
              </p>
            ))}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Tile label="Connected mailboxes" loading={!s}>
                {s && (
                  <>
                    <Big value={s.connected} unit={s.connectedLimit ? `of ${s.connectedLimit}` : ""} />
                    <Small>
                      {s.needingReview ? `${s.needingReview} need attention` : "All healthy"} · {s.campaignDaily} campaign emails
                      a day
                    </Small>
                  </>
                )}
              </Tile>
              <Tile label="Campaign sends this period" loading={!s}>
                {s && (
                  <>
                    <Big value={s.sendsUsed.toLocaleString()} unit={s.sendsLimit ? `of ${s.sendsLimit.toLocaleString()}` : ""} />
                    <Small>{s.periodEndsAt ? `Resets ${shortDate(s.periodEndsAt)}` : "Plan period"}</Small>
                  </>
                )}
              </Tile>
              <Tile label="Warmup today" loading={!s}>
                {s && (
                  <>
                    <Big value={s.warmupTodaySends} unit="sent" />
                    <Small>
                      {s.warmupTodayInbox} inbox · {s.warmupTodaySpam} spam · {s.warmupTodaySaved} saved from spam
                    </Small>
                  </>
                )}
              </Tile>
              <Tile label="Inbox placement, 7 days" loading={!s}>
                {s && (
                  <>
                    <Big value={pct(s.warmupWeekInbox, s.warmupWeekInbox + s.warmupWeekSpam + s.warmupWeekSaved)} unit="" />
                    <Small>
                      {s.warmupWeekSent} warmup sent · {s.warmupWeekSpam} in spam
                    </Small>
                  </>
                )}
              </Tile>
            </div>

            {(domains.length > 0 || (d?.campaigns.length ?? 0) > 0) && (
              <div className="grid gap-3 lg:grid-cols-2">
                <section className="rounded-lg border px-4 py-3">
                  <h2 className="text-[13px] text-muted-foreground">Domains</h2>
                  <ul className="mt-2 space-y-1.5">
                    {domains.map((x) => (
                      <li key={x.domain} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">{x.domain}</span>
                        <Pill tone={x.health === "healthy" ? "positive" : x.health === "unknown" ? "neutral" : "warning"}>
                          {x.health === "healthy" ? "DNS healthy" : x.health}
                        </Pill>
                        {x.problems.map((p) => (
                          <span key={p} className="w-full text-[13px] text-muted-foreground">
                            {p}
                          </span>
                        ))}
                      </li>
                    ))}
                    {domains.length === 0 && <li className="text-sm text-muted-foreground">Not available.</li>}
                  </ul>
                </section>
                <CampaignsCard fallback={d?.campaigns ?? []} />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search mailboxes"
                  placeholder="Search name or email"
                  className="pl-8"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Select value={domain} onValueChange={setDomain}>
                <SelectTrigger aria-label="Filter by domain" className="w-56!">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All domains</SelectItem>
                  {domains.map((x) => (
                    <SelectItem key={x.domain} value={x.domain}>
                      {x.domain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <FacetFilters values={extra} onChange={setExtra} count={shown.length} fields={[
              {key:"provider",label:"Provider",options:choices((d?.mailboxes ?? []).map((m) => m.provider))},
              {key:"status",label:"Mailbox status",options:choices((d?.mailboxes ?? []).map((m) => m.status))},
              {key:"auth",label:"Authentication status",options:choices((d?.mailboxes ?? []).map((m) => m.authStatus))},
              {key:"attention",label:"Needs attention",options:[{value:"yes",label:"Needs attention"},{value:"no",label:"No issues reported"}]},
              {key:"warmup",label:"Warmup enabled",options:PRESENCE_OPTIONS},
            ]} />
            {!d ? (
              <TableSkeleton rows={8} />
            ) : d.mailboxes.length === 0 ? (
              <EmptyState
                icon={Mails}
                title="No mailboxes"
                description="Connect mailboxes in CheapSequencer and they show up here."
              />
            ) : shown.length === 0 ? (
              <EmptyState icon={Search} title="No mailboxes match" />
            ) : (
              <MailboxTable rows={shown} />
            )}
          </>
        )}
      </div>
    </>
  )
}

/** Coldbrew's campaigns with how many leads were queued into each, and a manual follow-up check. */
function CampaignsCard({ fallback }: { fallback: Mailboxes["campaigns"] }) {
  const { currentWorkspaceId } = useStore()
  const sending = useApi(
    () => (currentWorkspaceId ? fetchSendingCampaigns(currentWorkspaceId) : Promise.resolve(null)),
    [currentWorkspaceId],
  )
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const rows = (sending.data ?? fallback.map((c) => ({ ...c, id: c.name, queued: null as number | null })))
    .filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()) && (statusFilter === "all" || c.status === statusFilter))

  const setUp = async () => {
    if (!currentWorkspaceId) return
    setBusy(true)
    const id = toast.loading("Checking every ICP has its campaign…")
    try {
      const r = await syncCampaigns(currentWorkspaceId)
      const made = r.filter((x) => x.status === "created" || x.status === "renamed" || x.status === "linked")
      const skipped = r.filter((x) => x.status === "skipped")
      const say = made.length ? `${made.length} set up: ${made.map((x) => x.icp).join(", ")}.` : "Every ICP already had its campaign."
      ;(skipped.length ? toast.warning : toast.success)(say, {
        id,
        description: skipped.length ? skipped.map((x) => `${x.icp}: ${x.note}`).join(" ") : "New campaigns stay in draft. Nothing sends until you activate one in CheapSequencer.",
      })
      sending.reload()
    } catch (e) {
      toast.error("Couldn't set up campaigns", { id, description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  const check = async () => {
    if (!currentWorkspaceId) return
    setBusy(true)
    const id = toast.loading("Checking every queued lead in CheapSequencer…")
    try {
      const r = await runFollowUps(currentWorkspaceId)
      toast.success(`${r.written} follow-up${r.written === 1 ? "" : "s"} written`, {
        id,
        description: [`${r.checked} leads checked, ${r.ended} finished or replied. Claude cost ${formatUsd(r.costUsd)}.`, ...r.notes.slice(0, 2)].join(" "),
      })
      sending.reload()
    } catch (e) {
      toast.error("Couldn't check follow-ups", { id, description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border px-4 py-3">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-[13px] text-muted-foreground">Campaigns</h2>
        {currentWorkspaceId && (
          <>
            <Button size="sm" variant="ghost" className="-my-1" disabled={busy} onClick={() => void setUp()}>
              <Wand2 /> Set up campaigns
            </Button>
            <ManagerOnly><Button size="sm" variant="ghost" className="-my-1" disabled={busy} onClick={() => void check()}>
              <Sparkles /> Check follow-ups now
            </Button></ManagerOnly>
          </>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Input className="min-w-40 flex-1" aria-label="Search campaigns" placeholder="Search campaigns" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-36" aria-label="Filter campaigns by status"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="draft">Draft</SelectItem><SelectItem value="paused">Paused</SelectItem></SelectContent></Select>
        <Button variant="outline" size="sm" disabled={sending.loading} onClick={sending.reload}><RotateCw /> Refresh</Button>
      </div>
      {sending.error && <p role="alert" className="mt-2 text-xs text-destructive">Live campaign status unavailable: {sending.error}. The list may be out of date.</p>}
      <ul className="mt-3 space-y-3">
        {rows.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            {c.queued !== null && <span className="text-[13px] text-muted-foreground tabular-nums">{c.queued} queued</span>}
            {c.dailySendCap !== null && <span className="text-[13px] text-muted-foreground tabular-nums">{c.dailySendCap} a day</span>}
            <Pill tone={c.status === "active" ? "positive" : c.status === "paused" ? "warning" : "neutral"}>
              {c.status === "draft" ? "Draft, not sending" : c.status}
            </Pill>
            {currentWorkspaceId && sending.data && <CampaignReadinessPanel wsId={currentWorkspaceId} campaignId={c.id} />}
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-muted-foreground">No campaigns yet.</li>}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Follow-ups are also checked on their own every 30 minutes.</p>
    </section>
  )
}

function MailboxTable({ rows }: { rows: Mailbox[] }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mailbox</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Warmup</TableHead>
            <TableHead className="text-right">Daily limit</TableHead>
            <TableHead className="text-right">Sent today</TableHead>
            <TableHead className="text-right">Inbox / spam today</TableHead>
            <TableHead>Last sent</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => {
            const warm = WARMUP_LABEL[m.warmupState ?? ""] ?? { label: m.warmupState ?? "Off", tone: "neutral" as PillTone }
            return (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="font-medium">{m.name || m.email}</div>
                  <div className="text-xs text-muted-foreground">{m.email}</div>
                </TableCell>
                <TableCell>
                  {m.needsAttention ? (
                    <span title={m.lastError ?? undefined}>
                      <Pill tone="negative">{m.authStatus !== "ok" ? "Reconnect needed" : "Needs attention"}</Pill>
                    </span>
                  ) : (
                    <Pill tone="positive">Connected</Pill>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground capitalize">{m.provider}</div>
                </TableCell>
                <TableCell>
                  {m.warmupEnabled ? <Pill tone={warm.tone}>{warm.label}</Pill> : <Pill>Off</Pill>}
                  {m.warmupStartedAt && (
                    <div className="mt-1 text-xs text-muted-foreground">since {shortDate(m.warmupStartedAt)}</div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <div>{m.totalDaily}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.campaignDaily} campaign · {m.warmupDaily} warmup
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {m.todaySends}
                  {m.todayFailed > 0 && <div className="text-xs text-destructive">{m.todayFailed} failed</div>}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <span>{m.todayInbox}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className={m.todaySpam ? "text-destructive" : undefined}>{m.todaySpam}</span>
                  {m.todaySaved > 0 && <div className="text-xs text-muted-foreground">{m.todaySaved} saved from spam</div>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{ago(m.lastSentAt)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function Tile({ label, loading, children }: { label: string; loading: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border px-4 py-3">
      <h2 className="text-[13px] text-muted-foreground">{label}</h2>
      {loading ? <div className="mt-2 h-12 animate-pulse rounded bg-muted" /> : children}
    </section>
  )
}

function Big({ value, unit }: { value: number | string; unit: string }) {
  return (
    <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
      {value}
      {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
    </p>
  )
}

function Small({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-muted-foreground tabular-nums">{children}</p>
}
