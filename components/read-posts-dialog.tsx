"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type Job, type PostGatherResult, type PostSource, gatherPosts } from "@/lib/api"
import { COST_PER_POST, postsSummary } from "@/lib/costs"
import { formatUsd } from "@/lib/format"

const BATCH = 25 // people or companies per job (the server's limit)
const JUDGE = 0.0006 // Claude's check after each source, per person or company
const SOURCES: { key: PostSource; label: string; hint: string; cost: number; people: boolean }[] = [
  { key: "company_linkedin", label: "Company LinkedIn", hint: "Their company page's posts.", cost: COST_PER_POST.linkedin, people: false },
  { key: "person_linkedin", label: "Their own LinkedIn", hint: "The person's own posts.", cost: COST_PER_POST.linkedin, people: true },
  { key: "company_instagram", label: "Company Instagram", hint: "The account their website links.", cost: COST_PER_POST.instagram, people: false },
]

/** Read posts for people and/or companies: any of the three sources, up to a limit each, and Claude stops for each one
 * once it has enough to write with. */
export function ReadPostsDialog({
  wsId,
  personIds = [],
  companyIds = [],
  onClose,
  onDone,
}: {
  wsId: string
  personIds?: string[]
  companyIds?: string[]
  onClose: () => void
  onDone: () => void
}) {
  const offered = SOURCES.filter((s) => personIds.length > 0 || !s.people)
  const [chosen, setChosen] = useState<Set<PostSource>>(new Set(offered.map((s) => s.key)))
  const [maxPosts, setMaxPosts] = useState("3")
  const [days, setDays] = useState("60")
  const [running, setRunning] = useState(false)
  const [job, setJob] = useState<Job | null>(null)
  const [done, setDone] = useState(0)

  const n = Number(maxPosts)
  const d = Number(days)
  const bad = !(Number.isInteger(n) && n >= 1 && n <= 20) || !(Number.isInteger(d) && d >= 1 && d <= 365)
  const count = personIds.length + companyIds.length
  const sources = offered.filter((s) => chosen.has(s.key))
  const ceiling = count * ((n || 0) + Math.min(2, n || 0)) * sources.reduce((sum, s) => sum + s.cost, 0) + count * JUDGE * sources.length
  const toggle = (key: PostSource, on: boolean) =>
    setChosen((set) => {
      const next = new Set(set)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  const run = async () => {
    setRunning(true)
    const all: PostGatherResult["results"] = []
    let cost = 0
    try {
      const groups: { stakeholderIds?: string[]; companyIds?: string[] }[] = []
      for (let i = 0; i < personIds.length; i += BATCH) groups.push({ stakeholderIds: personIds.slice(i, i + BATCH) })
      for (let i = 0; i < companyIds.length; i += BATCH) groups.push({ companyIds: companyIds.slice(i, i + BATCH) })
      for (const [i, group] of groups.entries()) {
        setDone(i * BATCH)
        const r = await gatherPosts(wsId, { ...group, sources: sources.map((s) => s.key), maxPosts: n, maxAgeDays: d }, setJob)
        all.push(...r.results)
        cost += r.costUsd + r.claudeCostUsd
        if (r.error) {
          toast.error("Stopped early", { description: `${r.error} ${postsSummary(all)}` })
          onDone()
          return onClose()
        }
      }
      const fresh = all.reduce((sum, x) => sum + x.new, 0)
      toast.success(postsSummary(all), { description: `${fresh} new posts of their own saved. ${formatUsd(cost)} with Claude's checks.` })
      onDone()
      onClose()
    } catch (e) {
      toast.error("Couldn't read posts", { description: e instanceof Error ? e.message : undefined })
      onDone()
      setRunning(false)
    }
  }

  const what = [
    personIds.length ? `${personIds.length.toLocaleString()} ${personIds.length === 1 ? "person" : "people"}` : "",
    companyIds.length ? `${companyIds.length.toLocaleString()} ${companyIds.length === 1 ? "company" : "companies"}` : "",
  ]
    .filter(Boolean)
    .join(" and ")

  return (
    <Dialog open onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className="sm:max-w-md!">
        <DialogHeader>
          <DialogTitle>Read posts for {what}</DialogTitle>
          <DialogDescription>
            Every source you tick is read. Each starts with a first look of 2 posts; Claude checks whether they&apos;re
            enough to write with, and only if not does it read that source up to your limit. Posts already saved
            aren&apos;t bought again.
          </DialogDescription>
        </DialogHeader>

        {running ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {job?.step ?? "Starting"}
            {count > BATCH ? ` · ${Math.min(done, count).toLocaleString()} of ${count.toLocaleString()} done` : ""}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2.5">
              {offered.map((s) => (
                <label key={s.key} className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <Checkbox className="mt-0.5" checked={chosen.has(s.key)} onCheckedChange={(v) => toggle(s.key, v === true)} />
                  <span>
                    {s.label}
                    <span className="block text-xs text-muted-foreground">{s.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="read-max">Most posts per source</Label>
                <Input id="read-max" type="number" inputMode="numeric" value={maxPosts} onChange={(e) => setMaxPosts(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="read-days">From the last (days)</Label>
                <Input id="read-days" type="number" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
              </div>
            </div>
            <p className={bad ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {bad
                ? "Posts: 1 to 20. Days: 1 to 365."
                : `At most about ${formatUsd(ceiling)}, if every source needed its full limit. Usually less: many stop at the first look. Logged on Usage.`}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button disabled={running || bad || sources.length === 0} onClick={() => void run()}>
            {running ? "Reading…" : "Read posts"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
