"use client"

import { useState } from "react"
import { ActivityFeed } from "@/components/config/activity-feed"
import { DryRunBanner } from "@/components/config/campaign-bits"
import { LoadError } from "@/components/config/load-error"
import { Page } from "@/components/config/shell"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchActivity, fetchSendingStatus, useApi } from "@/lib/config-api"
import { useSession } from "@/lib/config-session"

type Kind = "all" | "sends" | "replies" | "problems"

export default function ActivityPage() {
  const { workspaceId } = useSession()
  const [kind, setKind] = useState<Kind>("all")
  const items = useApi(() => (workspaceId ? fetchActivity(workspaceId, { kind: kind === "all" ? "" : kind }) : Promise.resolve([])), [workspaceId, kind])
  const status = useApi(fetchSendingStatus, [])
  return (
    <Page title="Activity" description="Every email sent from your mailboxes, and every reply, bounce and unsubscribe that came back, newest first.">
      <DryRunBanner live={status.data?.live} />
      <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">Everything</TabsTrigger>
          <TabsTrigger value="sends">Sends</TabsTrigger>
          <TabsTrigger value="replies">Replies</TabsTrigger>
          <TabsTrigger value="problems">Problems</TabsTrigger>
        </TabsList>
      </Tabs>
      <section className="overflow-hidden rounded-xl border bg-card">
        {items.error && !items.data ? (
          <LoadError message={items.error} onRetry={items.reload} />
        ) : !items.data ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <ActivityFeed
            items={items.data}
            empty={kind === "problems" ? "No failed sends, bounces or unsubscribes." : kind === "replies" ? "No replies yet." : "Nothing yet. Start a campaign with leads in it and its sends show here."}
          />
        )}
      </section>
    </Page>
  )
}
