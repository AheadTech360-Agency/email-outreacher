"use client"

import Link from "next/link"
import { useState } from "react"
import { AlertTriangle, Sparkles, Wand2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fetchLeadPosts, generateEmails, useApi } from "@/lib/api"
import { fetchLeadBriefs } from "@/lib/lists"
import { COST_PER_POST, FETCHED_SOURCES, postsCeiling, postsSummary } from "@/lib/costs"
import { SOURCE_LABEL, formatUsd } from "@/lib/format"
import { resolveTemplate } from "@/lib/selectors"
import { useStore } from "@/lib/store"
import type { ICP } from "@/lib/types"

// The backend takes up to 25 leads per request; bigger runs go in batches, one after another.
const BATCH = 25

function batches<T>(list: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += BATCH) out.push(list.slice(i, i + BATCH))
  return out
}

/** Which networks to fetch for an ICP's leads, how many posts and how far back (the ICP's own, else Settings). */
function postSettings(icp: ICP, settings: { postsPerLead: number; maxPostAgeDays: number }) {
  return {
    sources: FETCHED_SOURCES.filter((s) => icp.enabledSources.includes(s)),
    maxPosts: Math.min(20, Math.max(1, icp.postsPerSource ?? settings.postsPerLead)),
    maxAgeDays: Math.min(365, Math.max(1, icp.maxPostAgeDays ?? settings.maxPostAgeDays)),
  }
}

/** Fetch the leads' recent LinkedIn and Instagram posts through Apify, for the sources the ICP has on. */
export function EnrichDialog({
  icp,
  leadIds,
  open,
  onOpenChange,
}: {
  icp: ICP
  leadIds: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { settings, currentWorkspaceId, reloadLeads } = useStore()
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState("")
  // The picked leads, read when the dialog opens (only those that still exist run, as before).
  const briefs = useApi(() => (open && currentWorkspaceId ? fetchLeadBriefs(currentWorkspaceId, leadIds) : Promise.resolve([])), [open, currentWorkspaceId, leadIds.join(",")])
  const targets = briefs.data ?? []
  const { sources, maxPosts, maxAgeDays } = postSettings(icp, settings)
  const ceiling = postsCeiling(targets.length, maxPosts, sources)

  const run = async () => {
    setRunning(true)
    let found = 0
    let cost = 0
    let error: string | null = null
    const all: { enough: boolean; new: number; stoppedAt: string | null }[] = []
    const groups = batches(targets.map((l) => l.id))
    try {
      for (const [i, ids] of groups.entries()) {
        setProgress(groups.length > 1 ? `Batch ${i + 1} of ${groups.length}` : "")
        const r = await fetchLeadPosts(currentWorkspaceId, { leadIds: ids, maxPosts, maxAgeDays, sources: [...sources] })
        found += r.results.reduce((sum, x) => sum + x.new, 0)
        cost += (r.costUsd ?? 0) + r.claudeCostUsd
        all.push(...r.results)
        if (r.error) {
          error = r.error
          break
        }
      }
      if (error) toast.error("Apify stopped the run", { description: `${error} ${found} new posts were saved before it stopped.` })
      else toast.success(postsSummary(all), { description: `${found} new posts saved. ${formatUsd(cost)} with Claude's checks.` })
      onOpenChange(false)
    } catch (e) {
      toast.error("Couldn't fetch posts", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setRunning(false)
      setProgress("")
      reloadLeads()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Fetch posts for {targets.length} lead{targets.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Each source is read: the company&apos;s LinkedIn, their own LinkedIn, the company&apos;s Instagram. Each starts
            with 2 posts; Claude checks whether they&apos;re enough to write with, and only if not reads up to {maxPosts}
            (from the last {maxAgeDays} days). Every post found is used when the email is written.
          </DialogDescription>
        </DialogHeader>
        {sources.length === 0 ? (
          <p className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 flex-none text-warning" />
            Turn on LinkedIn or Instagram in this ICP&apos;s Enrichment sources first.
          </p>
        ) : (
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Sources</dt>
            <dd className="text-right">{sources.map((s) => SOURCE_LABEL[s]).join(", ")}</dd>
            <dt className="text-muted-foreground">Costs at most (usually far less)</dt>
            <dd className="text-right font-medium tabular-nums">{formatUsd(ceiling)}</dd>
          </dl>
        )}
        <p className="text-xs text-muted-foreground">
          Posts per network and how far back come from Settings. What Apify actually charges shows on the Usage page.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Cancel
          </Button>
          <Button disabled={running || briefs.loading || sources.length === 0 || targets.length === 0} onClick={() => void run()}>
            <Sparkles /> {running ? `Fetching…${progress ? ` ${progress}` : ""}` : "Fetch posts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Write emails for the leads with Claude: hook selection, the email, then its score. Drafts go to Review. */
export function GenerateDialog({
  icp,
  leadIds,
  open,
  onOpenChange,
}: {
  icp: ICP
  leadIds: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { templates, settings, currentWorkspaceId, reloadLeads } = useStore()
  // The picked leads' status and profiles, read when the dialog opens: who needs posts first.
  const briefs = useApi(() => (open && currentWorkspaceId ? fetchLeadBriefs(currentWorkspaceId, leadIds) : Promise.resolve([])), [open, currentWorkspaceId, leadIds.join(",")])
  const [instruction, setInstruction] = useState("")
  // Emails are written from everything we know: leads whose posts were never fetched get them first.
  const post = postSettings(icp, settings)
  const needPosts = (briefs.data ?? []).filter(
    (l) =>
      (l.status === "imported" || l.status === "failed") &&
      post.sources.some((s) => (s === "linkedin" ? l.linkedinUrl : l.instagramUrl)),
  )
  const postsCeiling = post.sources.reduce(
    (sum, s) => sum + needPosts.filter((l) => (s === "linkedin" ? l.linkedinUrl : l.instagramUrl)).length * post.maxPosts * COST_PER_POST[s],
    0,
  )
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState("")
  const hookPrompt = resolveTemplate(templates, icp, "hook")
  const emailPrompt = resolveTemplate(templates, icp, "email")

  const run = async () => {
    setRunning(true)
    let drafted = 0
    let cost = 0
    const problems: string[] = []
    const groups = batches(leadIds)
    try {
      let postsCost = 0
      for (const ids of batches(needPosts.map((l) => l.id))) {
        setProgress("fetching their posts first")
        try {
          const r = await fetchLeadPosts(currentWorkspaceId, { leadIds: ids, maxPosts: post.maxPosts, maxAgeDays: post.maxAgeDays, sources: [...post.sources] })
          postsCost += r.costUsd ?? 0
          if (r.error) problems.push(`Posts: ${r.error}`)
        } catch (e) {
          problems.push(`Posts couldn't be fetched: ${e instanceof Error ? e.message : "unknown error"}`)
        }
      }
      if (postsCost) problems.push(`Apify charged ${formatUsd(postsCost)} for their posts.`)
      for (const [i, ids] of groups.entries()) {
        setProgress(groups.length > 1 ? `Batch ${i + 1} of ${groups.length}` : "")
        const r = await generateEmails(currentWorkspaceId, ids, instruction)
        drafted += r.drafted
        cost += r.costUsd
        problems.push(...r.results.filter((x) => x.status !== "drafted" && x.reason).map((x) => x.reason!))
      }
      const reasons = [...new Set(problems)]
      const description = [cost ? `Claude cost ${formatUsd(cost)}.` : "", ...reasons].filter(Boolean).join(" ") || undefined
      if (drafted) toast.success(`${drafted} email${drafted === 1 ? "" : "s"} written, ready in Review`, { description })
      else toast.error("No emails were written", { description })
      onOpenChange(false)
    } catch (e) {
      toast.error("Couldn't write them", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setRunning(false)
      setProgress("")
      reloadLeads()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Write emails for {leadIds.length} lead{leadIds.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Claude picks hooks from their posts, writes each email, then scores it. Nothing is sent: drafts wait in Review.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Hook selection prompt</dt>
          <dd className="text-right">{hookPrompt?.name ?? "Default"}</dd>
          <dt className="text-muted-foreground">Email prompt</dt>
          <dd className="text-right">{emailPrompt?.name ?? "Default"}</dd>
        </dl>
        <div className="space-y-1.5">
          <Label htmlFor="generate-instruction">Extra instruction (optional)</Label>
          <Input
            id="generate-instruction"
            placeholder="e.g. keep it under 80 words"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
        </div>
        {needPosts.length > 0 && (
          <p className="text-sm">
            {needPosts.length} lead{needPosts.length === 1 ? " has" : "s have"} no posts fetched yet. Their recent posts are
            fetched first, so the email is written from them (Apify, at most {formatUsd(postsCeiling)}).
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Each email is written from their posts, their company&apos;s website and posts, and this ICP&apos;s details. Claude
          charges per email; what each run cost shows on the{" "}
          <Link href="/usage" className="underline">
            Usage
          </Link>{" "}
          page. Leads already drafted get a new draft in place of their unsent one.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Cancel
          </Button>
          <Button disabled={running || briefs.loading || leadIds.length === 0} onClick={() => void run()}>
            <Wand2 /> {running ? `Writing…${progress ? ` ${progress}` : ""}` : "Write emails"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
