"use client"
import Link from "next/link"
import { AlertTriangle, Inbox, MessageSquare, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fetchRecentJobs, fetchSendingCampaigns, useApi, type HomeData } from "@/lib/api"

export function HomeAttention({ wsId, todo }: { wsId: string; todo: HomeData["todo"] }) {
  const jobs = useApi(() => fetchRecentJobs(wsId), [wsId])
  const campaigns = useApi(() => fetchSendingCampaigns(wsId), [wsId])
  const failures = (jobs.data ?? []).filter((job) => job.status === "failed")
  const waiting = (campaigns.data ?? []).filter((campaign) => campaign.queued > 0 && campaign.status !== "active")
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-medium">Needs attention</h2><p className="text-xs text-muted-foreground">Quick access to the next useful action.</p></div>
      <Button variant="ghost" size="sm" onClick={() => { jobs.reload(); campaigns.reload() }}><RotateCw /> Refresh status</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Link href="/review" className="space-y-2 rounded-lg border p-4 transition-colors hover:bg-muted/40"><Inbox className="size-4 text-data" /><p className="text-2xl tabular-nums">{todo.draftsToReview}</p><p className="text-sm font-medium">Emails awaiting review</p><p className="text-xs text-muted-foreground">Edit, approve, and move to the next email</p></Link>
      <Link href="/mailboxes" className="space-y-2 rounded-lg border p-4 transition-colors hover:bg-muted/40"><AlertTriangle className="size-4 text-warning" /><p className="text-2xl tabular-nums">{campaigns.data ? waiting.length : "?"}</p><p className="text-sm font-medium">Campaigns with queued leads, not active</p><p className="text-xs text-muted-foreground">{campaigns.error ? "Live status unavailable. Open Mailboxes to retry." : waiting.length ? waiting.slice(0, 2).map((c) => c.name).join(", ") : "Check readiness and resolve launch blockers"}</p></Link>
      <button type="button" className="space-y-2 rounded-lg border p-4 text-left transition-colors hover:bg-muted/40" onClick={() => window.dispatchEvent(new CustomEvent("coldbrew:open-activity", { detail: { workspaceId: wsId, status: "failed" } }))}><AlertTriangle className="size-4 text-negative" /><p className="text-2xl tabular-nums">{jobs.data ? failures.length : "?"}</p><p className="text-sm font-medium">Failed recent jobs</p><p className="text-xs text-muted-foreground">{jobs.error ? "Activity unavailable. Open to retry loading." : "View errors and return to the related page"}</p></button>
      <Link href="/replies" className="space-y-2 rounded-lg border p-4 transition-colors hover:bg-muted/40"><MessageSquare className="size-4 text-positive" /><p className="text-2xl tabular-nums">{todo.replies}</p><p className="text-sm font-medium">Leads who replied in the last 14 days</p><p className="text-xs text-muted-foreground">Open conversations and respond</p></Link>
    </div>
  </section>
}
