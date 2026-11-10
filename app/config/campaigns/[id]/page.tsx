"use client"

import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { Archive, Eye, MoreHorizontal, Pause, Play, Square, Trash2, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { ActivityFeed } from "@/components/config/activity-feed"
import { AddLeadsDialog } from "@/components/config/add-leads-dialog"
import { CampaignStatusPill, DryRunBanner, EnrollmentStatusPill, rate } from "@/components/config/campaign-bits"
import { CampaignEditor } from "@/components/config/campaign-editor"
import { LoadError } from "@/components/config/load-error"
import { PreviewDialog } from "@/components/config/preview-dialog"
import { Page } from "@/components/config/shell"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  type CampaignStatus,
  type Enrollment,
  actOnEnrollment,
  canManage,
  deleteCampaign,
  editCampaign,
  errorText,
  fetchActivity,
  fetchCampaign,
  fetchEnrollments,
  fetchSendingStatus,
  setCampaignStatus,
  useApi,
} from "@/lib/config-api"
import { useSession } from "@/lib/config-session"

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "")

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>()
  const { workspaceId, me, href } = useSession()
  const router = useRouter()
  const manager = canManage(me?.role)
  const campaign = useApi(() => (workspaceId ? fetchCampaign(workspaceId, id) : Promise.resolve(null)), [workspaceId, id])
  const enrollments = useApi(() => (workspaceId ? fetchEnrollments(workspaceId, id) : Promise.resolve([])), [workspaceId, id])
  const activity = useApi(() => (workspaceId ? fetchActivity(workspaceId, { campaignId: id }) : Promise.resolve([])), [workspaceId, id])
  const status = useApi(fetchSendingStatus, [])
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState<"delete" | "archive" | null>(null)
  const [tab, setTab] = useState<string | null>(null)

  const c = campaign.data
  if (campaign.error && !c) return <Page title="Campaign"><LoadError message={campaign.error} onRetry={campaign.reload} /></Page>
  if (!c || !workspaceId)
    return (
      <Page title="Campaign">
        <Skeleton className="h-40 w-full rounded-xl" />
      </Page>
    )

  const s = c.stats
  const shownTab = tab ?? (s.leads ? "leads" : "emails")
  const needsFirstEmail = c.steps.some((step) => (step.subject + step.body).includes("email1"))
  const changeStatus = async (next: CampaignStatus) => {
    try {
      const updated = await setCampaignStatus(workspaceId, c.id, next)
      campaign.setData(updated)
      toast.success(next === "active" ? (status.data?.live ? "Running: emails go out inside its window" : "Running in dry run: emails are logged, not sent") : next === "paused" ? "Paused: nothing more goes out until you resume it" : "Archived")
    } catch (e) {
      toast.error("Couldn't change it", { description: errorText(e) })
    }
  }
  const refresh = () => (campaign.reload(), enrollments.reload(), activity.reload())

  return (
    <Page
      title={c.name}
      description={c.icpId ? `The campaign for the ${c.icpName ?? "ICP"} ICP. Every ICP keeps one: archive it to stop it.` : undefined}
      actions={
        manager && (
          <>
            <CampaignStatusPill status={c.status} />
            {c.status !== "archived" && (
              <Button variant="outline" onClick={() => setAdding(true)}>
                <UserPlus /> Add leads
              </Button>
            )}
            {(c.status === "draft" || c.status === "paused") && (
              <Button onClick={() => void changeStatus("active")}>
                <Play /> {c.status === "draft" ? "Start" : "Resume"}
              </Button>
            )}
            {c.status === "active" && (
              <Button variant="outline" onClick={() => void changeStatus("paused")}>
                <Pause /> Pause
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                {c.status !== "archived" && (
                  <DropdownMenuItem onSelect={() => setConfirm("archive")}>
                    <Archive /> Archive
                  </DropdownMenuItem>
                )}
                {!c.icpId && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" disabled={s.sent > 0} onSelect={() => setConfirm("delete")}>
                      <Trash2 /> {s.sent > 0 ? "Delete (it has sent)" : "Delete"}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )
      }
    >
      <DryRunBanner live={status.data?.live} />

      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-rule sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Leads" value={s.leads} sub={`${s.active} in sequence`} />
        <Stat label="Sent" value={s.sent} sub={s.dryRuns ? `${s.dryRuns} in dry run` : s.failed ? `${s.failed} failed` : undefined} />
        <Stat label="Replied" value={s.replies} sub={rate(s.replies, s.leads)} />
        <Stat label="Bounced" value={s.bounces} sub={rate(s.bounces, s.leads)} />
        <Stat label="Unsubscribed" value={s.unsubscribes} sub={rate(s.unsubscribes, s.leads)} />
        <Stat label="Finished" value={s.completed} sub={s.stopped ? `${s.stopped} stopped` : undefined} />
      </dl>

      <Tabs value={shownTab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="leads" className="mt-4">
          <LeadsTable wsId={workspaceId} rows={enrollments.data} error={enrollments.error} manager={manager} steps={c.steps.length}
                      onChanged={refresh} onAdd={() => setAdding(true)} archived={c.status === "archived"} />
        </TabsContent>

        <TabsContent value="emails" className="mt-4">
          <CampaignEditor
            key={c.updatedAt}
            initial={{ name: c.name, schedule: c.schedule, steps: c.steps }}
            variables={status.data?.variables ?? {}}
            disabled={!manager || c.status === "archived"}
            saveLabel="Save changes"
            onSave={async (input) => {
              const saved = await editCampaign(workspaceId, c.id, input)
              campaign.setData(saved)
              toast.success("Saved", { description: s.leads ? "Leads part-way through get the new text from their next email." : undefined })
            }}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <section className="overflow-hidden rounded-xl border bg-card">
            {activity.error && !activity.data ? (
              <LoadError message={activity.error} onRetry={activity.reload} />
            ) : (
              <ActivityFeed items={activity.data ?? []} showCampaign={false} empty="Nothing yet. Sends, replies and bounces show here as they happen." />
            )}
          </section>
        </TabsContent>
      </Tabs>

      {adding && (
        <AddLeadsDialog wsId={workspaceId} campaignId={c.id} icpName={c.icpId ? c.icpName ?? "this ICP" : null} needsFirstEmail={needsFirstEmail} onClose={() => setAdding(false)}
                        onAdded={() => (setAdding(false), refresh(), setTab("leads"))} />
      )}

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "delete" ? `Delete ${c.name}?` : `Archive ${c.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "It has sent nothing, so its leads are freed to be added to another campaign."
                : "It stops sending for good and keeps its history. Leads in it won't get any more emails from it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "delete" ? "destructive" : "default"}
              onClick={async () => {
                if (confirm === "archive") return void changeStatus("archived")
                try {
                  await deleteCampaign(workspaceId, c.id)
                  toast.success(`Deleted ${c.name}`)
                  router.push(href("/campaigns"))
                } catch (e) {
                  toast.error("Couldn't delete it", { description: errorText(e) })
                }
              }}
            >
              {confirm === "delete" ? `Delete ${c.name}` : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  )
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-card px-4 py-3.5">
      <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-2">
        <span className="text-[22px] leading-7 font-semibold tabular-nums">{value.toLocaleString()}</span>
        {sub && sub !== "—" && <span className="text-[12px] text-muted-foreground tabular-nums">{sub}</span>}
      </dd>
    </div>
  )
}

function LeadsTable({ wsId, rows, error, manager, steps, onChanged, onAdd, archived }: {
  wsId: string
  rows: Enrollment[] | null
  error: string | null
  manager: boolean
  steps: number
  onChanged: () => void
  onAdd: () => void
  archived: boolean
}) {
  const [previewing, setPreviewing] = useState<string | null>(null)
  const act = async (e: Enrollment, action: "pause" | "resume" | "stop") => {
    try {
      await actOnEnrollment(wsId, e.id, action)
      toast.success(action === "stop" ? `Stopped ${e.name}` : action === "pause" ? `Paused ${e.name}` : `Resumed ${e.name}`)
      onChanged()
    } catch (err) {
      toast.error("Couldn't change it", { description: errorText(err) })
    }
  }
  if (error && !rows) return <LoadError message={error} onRetry={onChanged} />
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="hidden grid-cols-[minmax(0,2fr)_130px_minmax(0,1.2fr)_minmax(0,1.2fr)_40px] gap-4 border-b bg-muted/50 px-5 py-2.5 text-[12.5px] font-medium text-muted-foreground md:grid">
        <span>Lead</span>
        <span>Status</span>
        <span>Progress</span>
        <span>Sends from</span>
        <span className="sr-only">Actions</span>
      </div>
      {!rows ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !rows.length ? (
        <div className="px-5 py-12 text-center">
          <p className="text-[14px] font-medium">No leads in this campaign yet</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Add leads whose Coldbrew email you&apos;ve approved. Each is sent from one mailbox, start to finish.</p>
          {manager && !archived && (
            <Button className="mt-4" onClick={onAdd}>
              <UserPlus /> Add leads
            </Button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-rule">
          {rows.map((e) => (
            <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-x-4 gap-y-1.5 px-5 py-3 md:grid-cols-[minmax(0,2fr)_130px_minmax(0,1.2fr)_minmax(0,1.2fr)_40px]">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium">{e.name}</p>
                <p className="truncate text-[12.5px] text-muted-foreground">{[e.email, e.company].filter(Boolean).join(", ")}</p>
              </div>
              <div className="col-start-1 md:col-start-auto">
                <EnrollmentStatusPill status={e.status} stopReason={e.stopReason} />
              </div>
              <p className="col-start-1 text-[12.5px] text-muted-foreground md:col-start-auto">
                {e.sent} of {steps} sent
                {e.status === "active" && e.nextRunAt && <span className="block">Email {e.nextStepOrder} around {when(e.nextRunAt)}</span>}
              </p>
              <p className="col-start-1 truncate text-[12.5px] text-muted-foreground md:col-start-auto">{e.sender ?? "No mailbox"}</p>
              <div className="col-start-2 row-span-4 row-start-1 flex justify-end md:col-start-auto md:row-span-1 md:row-start-auto">
                {manager && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Actions for ${e.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-48">
                      <DropdownMenuItem onSelect={() => setPreviewing(e.id)}>
                        <Eye /> Preview emails
                      </DropdownMenuItem>
                      {(e.status === "active" || e.status === "paused") && (
                        <>
                          {e.status === "active" ? (
                            <DropdownMenuItem onSelect={() => void act(e, "pause")}>
                              <Pause /> Pause
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onSelect={() => void act(e, "resume")}>
                              <Play /> Resume
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => void act(e, "stop")}>
                            <Square /> Stop for good
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {previewing && <PreviewDialog wsId={wsId} enrollmentId={previewing} onClose={() => setPreviewing(null)} />}
    </section>
  )
}
