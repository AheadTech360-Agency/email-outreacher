"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Activity, Loader2, RotateCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { Pill, type PillTone } from "@/components/status"
import { fetchRecentJobs, useApi, type Job } from "@/lib/api"
import { jobDestination, jobPercent } from "@/lib/job-progress"
import { useStore } from "@/lib/store"

const LABEL: Record<Job["status"], { label: string; tone: PillTone }> = {
  queued: { label: "Waiting", tone: "warning" }, running: { label: "Running", tone: "info" },
  done: { label: "Completed", tone: "positive" }, failed: { label: "Failed", tone: "negative" }, cancelled: { label: "Cancelled", tone: "neutral" },
}

export function BackgroundActivity() {
  const { currentWorkspaceId } = useStore()
  return currentWorkspaceId ? <WorkspaceActivity key={currentWorkspaceId} wsId={currentWorkspaceId} /> : null
}

function WorkspaceActivity({ wsId }: { wsId: string }) {
  const jobs = useApi(() => fetchRecentJobs(wsId), [wsId])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const active = (jobs.data ?? []).filter((j) => j.status === "queued" || j.status === "running")
  const reload = jobs.reload
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) reload() }, active.length ? 5000 : 30000)
    const changed = (event: Event) => { if ((event as CustomEvent).detail?.workspaceId === wsId) reload() }
    const openPanel = (event: Event) => {
      const detail = (event as CustomEvent).detail
      if (detail?.workspaceId === wsId) { setOpen(true); setStatus(detail.status === "failed" ? "failed" : "all"); reload() }
    }
    window.addEventListener("coldbrew:open-activity", openPanel)
    window.addEventListener("coldbrew:job-update", changed)
    return () => { clearInterval(timer); window.removeEventListener("coldbrew:job-update", changed); window.removeEventListener("coldbrew:open-activity", openPanel) }
  }, [active.length, reload, wsId])
  const term = query.trim().toLowerCase()
  const visible = (jobs.data ?? []).filter((j) => (status === "all" || (status === "active" ? j.status === "queued" || j.status === "running" : j.status === status)) &&
    `${j.label} ${j.step ?? ""} ${j.detail ?? ""}`.toLowerCase().includes(term))
  return <>
    {/* In the sidebar's footer: always reachable, without a strip across the top of every page. */}
    <SidebarMenuItem>
      <SidebarMenuButton className="h-8 text-[14px]" tooltip="Background activity" onClick={() => { setOpen(true); reload() }}>
        {active.length ? <Loader2 className="animate-spin text-primary" /> : <Activity className="text-muted-foreground" />}
        <span>Background activity</span>
        {jobs.error && <span className="size-2 rounded-full bg-warning" aria-label="Activity status unavailable" />}
      </SidebarMenuButton>
      {active.length > 0 && <SidebarMenuBadge className="tabular-nums">{active.length}</SidebarMenuBadge>}
    </SidebarMenuItem>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full! gap-0 overflow-y-auto sm:max-w-xl!">
        <SheetHeader className="border-b p-5">
          <SheetTitle>Background activity</SheetTitle>
          <SheetDescription>Recent work in this workspace, including jobs started on other pages. Active jobs appear first. Admins can see everyone&apos;s jobs.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{active.length} active / {jobs.data?.length ?? 0} recent jobs</p>
            <Button variant="ghost" size="sm" disabled={jobs.loading} onClick={reload}><RotateCw /> Refresh</Button></div>
          <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" aria-label="Search background jobs" placeholder="Search jobs, steps or errors" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full" aria-label="Filter background jobs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All jobs</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="done">Completed</SelectItem><SelectItem value="failed">Failed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select>
          {jobs.error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{jobs.error} <button className="underline" onClick={reload}>Try again</button></p>}
          {!jobs.data && !jobs.error && <p role="status" className="text-sm text-muted-foreground">Loading activity...</p>}
          {jobs.data && !visible.length && <p className="py-8 text-center text-sm text-muted-foreground">{query || status !== "all" ? "No jobs match these filters." : "No background work yet. Jobs will appear here when you start an import, research, or email generation."}</p>}
          <ul className="space-y-3">{visible.map((job) => <ActivityRow key={job.id} job={job} onNavigate={() => setOpen(false)} />)}</ul>
          <p className="text-xs text-muted-foreground">Showing up to 50 recent jobs. Closing this panel does not stop work. Refreshing status makes no paid provider calls.</p>
        </div>
      </SheetContent>
    </Sheet>
  </>
}

function ActivityRow({ job, onNavigate }: { job: Job; onNavigate: () => void }) {
  const percent = jobPercent(job)
  const state = LABEL[job.status]
  const active = job.status === "queued" || job.status === "running"
  return <li className="space-y-3 rounded-lg border p-4">
    <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium">{job.label}</p><Pill tone={state.tone}>{state.label}</Pill></div>
    <p className="text-sm text-muted-foreground">{job.detail || job.step || (active ? "Waiting for progress from the worker..." : state.label)}</p>
    {percent !== null && <div className="space-y-1.5"><Progress value={percent} aria-label={`${job.label} progress`} />
      <p className="text-xs tabular-nums text-muted-foreground">{job.status === "done" ? "Completed" : `${job.done} of ${job.total} in this step / ${percent}%`}</p></div>}
    {active && percent === null && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> {job.status === "queued" ? "Waiting for a worker; do not submit the same job again." : "Working; this step has no total count yet."}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleString()}</time>
      <Link className="text-data hover:underline" href={job.link ?? jobDestination(job.kind)} onClick={onNavigate}>{job.status === "failed" ? "Open page to try again" : "Open related page"}</Link>
    </div>
    {job.status === "failed" && <p className="text-xs text-muted-foreground">Check the error before restarting from the related page. Retrying research or generation can spend credits; this panel never retries automatically.</p>}
  </li>
}
