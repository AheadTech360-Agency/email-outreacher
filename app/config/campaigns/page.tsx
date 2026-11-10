"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { CampaignStatusPill, DryRunBanner, rate } from "@/components/config/campaign-bits"
import { LoadError } from "@/components/config/load-error"
import { Page } from "@/components/config/shell"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { canManage, fetchCampaigns, fetchSendingStatus, useApi } from "@/lib/config-api"
import { useSession } from "@/lib/config-session"

export default function CampaignsPage() {
  const { workspaceId, me, href } = useSession()
  const router = useRouter()
  const manager = canManage(me?.role)
  const campaigns = useApi(() => (workspaceId ? fetchCampaigns(workspaceId) : Promise.resolve([])), [workspaceId])
  const status = useApi(fetchSendingStatus, [])
  const list = campaigns.data ?? []

  return (
    <Page
      title="Campaigns"
      description="Each campaign sends its emails to the leads in it, from your connected mailboxes, inside its sending window."
      actions={
        manager && (
          <Button asChild>
            <Link href={href("/campaigns/new")}>
              <Plus /> New campaign
            </Link>
          </Button>
        )
      }
    >
      <DryRunBanner live={status.data?.live} />
      {campaigns.error && !campaigns.data ? (
        <LoadError message={campaigns.error} onRetry={campaigns.reload} />
      ) : !campaigns.data ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <section className="rounded-xl border bg-card px-6 py-14 text-center">
          <h2 className="text-[17px] font-semibold">No campaigns yet</h2>
          <p className="mx-auto mt-1.5 max-w-[50ch] text-[13.5px] text-muted-foreground">
            A campaign is the emails a lead gets and when: the first one Coldbrew wrote for them, then the follow-ups. Start one, check it in dry run, then add leads.
          </p>
          {manager && (
            <Button asChild className="mt-6">
              <Link href={href("/campaigns/new")}>
                <Plus /> New campaign
              </Link>
            </Button>
          )}
        </section>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="hidden grid-cols-[minmax(0,2fr)_110px_repeat(4,minmax(0,0.8fr))] gap-4 border-b bg-muted/50 px-5 py-2.5 text-[12.5px] font-medium text-muted-foreground md:grid">
            <span>Campaign</span>
            <span>Status</span>
            <span className="text-right">Leads</span>
            <span className="text-right">Sent</span>
            <span className="text-right">Replied</span>
            <span className="text-right">Bounced</span>
          </div>
          <ul className="divide-y divide-rule">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => router.push(href(`/campaigns/${c.id}`))}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-5 py-3.5 text-left transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40 md:grid-cols-[minmax(0,2fr)_110px_repeat(4,minmax(0,0.8fr))]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{c.name}</span>
                    <span className="block truncate text-[12.5px] text-muted-foreground">
                      {c.steps.length} {c.steps.length === 1 ? "email" : "emails"}
                      {c.stats.dryRuns > 0 && `, ${c.stats.dryRuns} logged in dry run`}
                    </span>
                  </span>
                  <span>
                    <CampaignStatusPill status={c.status} />
                  </span>
                  <Num label="Leads" value={c.stats.leads} />
                  <Num label="Sent" value={c.stats.sent} />
                  <Num label="Replied" value={c.stats.replies} sub={rate(c.stats.replies, c.stats.leads)} />
                  <Num label="Bounced" value={c.stats.bounces} sub={rate(c.stats.bounces, c.stats.leads)} warn={c.stats.leads >= 20 && c.stats.bounces / c.stats.leads > 0.03} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Page>
  )
}

function Num({ label, value, sub, warn }: { label: string; value: number; sub?: string; warn?: boolean }) {
  return (
    <span className="col-span-2 flex items-baseline justify-between gap-2 text-[13.5px] tabular-nums md:col-span-1 md:block md:text-right">
      <span className="text-[12.5px] text-muted-foreground md:hidden">{label}</span>
      <span>
        {value.toLocaleString()}
        {sub && <span className={warn ? "ml-1.5 text-[12px] text-negative" : "ml-1.5 text-[12px] text-muted-foreground"}>{sub}</span>}
      </span>
    </span>
  )
}
