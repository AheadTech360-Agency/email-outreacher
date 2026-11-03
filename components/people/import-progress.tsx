"use client"

import Link from "next/link"
import { Check, Circle, Loader2 } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import type { ImportRunResult, Job, SortListsResult } from "@/lib/api"
import { enrichSummary } from "@/lib/costs"
import { formatUsd } from "@/lib/format"
import { cn } from "@/lib/utils"

/** The import job's steps, by the step names the backend reports (routers/stakeholders.import_run). */
const STEPS: { step: string; label: string; sorting?: boolean; enrich?: boolean }[] = [
  { step: "Reading the file", label: "Reading the file" },
  { step: "Saving people", label: "Saving people, their leads and companies" },
  { step: "Reading websites", label: "Reading company websites", enrich: true },
  { step: "Reading Instagram profiles", label: "Reading Instagram profiles", enrich: true },
  { step: "Reading LinkedIn company pages", label: "Reading LinkedIn company pages", enrich: true },
  { step: "Reading LinkedIn profiles", label: "Reading people's LinkedIn profiles", enrich: true },
  { step: "Reading websites (companies)", label: "Reading company websites", sorting: true },
  { step: "Sorting with Claude (companies)", label: "Sorting companies into ICPs and smart lists", sorting: true },
  { step: "Drafting ICPs (companies)", label: "Drafting ICPs for new lists no ICP fits", sorting: true },
  { step: "Sorting with Claude (people)", label: "Sorting people into smart lists", sorting: true },
]

const n = (x: number) => x.toLocaleString()

export function ImportProgress({ job, sorting, enriching = [], rows }: { job: Job | null; sorting: boolean; enriching?: string[]; rows: number }) {
  const steps = STEPS.filter((s) => (sorting || !s.sorting) && (!s.enrich || enriching.includes(s.step)))
  const at = steps.findIndex((s) => s.step === job?.step)
  const current = at >= 0 ? steps[at] : null
  const saved = job?.step === "Saving people" ? job.done : at > 1 ? rows : 0
  return (
    <div className="space-y-4">
      <div className="rounded-md border px-3 py-3">
        <p className="text-sm font-medium tabular-nums">
          {n(saved)} of {n(rows)} people imported
        </p>
        <Progress className="mt-2" value={rows ? (saved / rows) * 100 : 0} />
      </div>
      <ol className="space-y-2 text-sm">
        {steps.map((s, i) => {
          const state = at < 0 ? "waiting" : i < at ? "done" : i === at ? "running" : "waiting"
          return (
            <li key={s.step} className="flex items-start gap-2">
              {state === "done" ? (
                <Check className="mt-0.5 size-4 shrink-0 text-positive" />
              ) : state === "running" ? (
                <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
              )}
              <div className="min-w-0 flex-1">
                <p className={cn(state === "waiting" && "text-muted-foreground")}>{s.label}</p>
                {state === "running" && job?.total ? (
                  <div className="mt-1 flex items-center gap-2">
                    <Progress className="h-1.5 flex-1" value={(job.done / job.total) * 100} />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {n(job.done)} / {n(job.total)}
                    </span>
                  </div>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="text-xs text-muted-foreground">
        {current ? "" : job?.step ? `${job.step}. ` : "Waiting for the worker to pick it up. "}
        You can close this: it carries on in the background, and new people show up on this page.
      </p>
    </div>
  )
}

function SortLine({ title, r }: { title: string; r: SortListsResult }) {
  const bits = [`${n(r.sorted)} sorted`]
  if (r.matchedIcp) bits.push(`${n(r.matchedIcp)} matched to an existing ICP`)
  if (r.newLists.length) bits.push(`new lists: ${r.newLists.join(", ")}`)
  if (r.drafted.length) bits.push(`ICP drafted for ${r.drafted.join(", ")}: review and create them on Smart lists`)
  if (r.duplicates) bits.push(`${n(r.duplicates)} duplicates joined their twin's list`)
  return (
    <li>
      <span className="font-medium text-foreground">{title}:</span> {bits.join(" · ")}
      {r.errors.length > 0 && <span className="block text-destructive">Stopped early: {r.errors[0]}</span>}
    </li>
  )
}

export function ImportSummary({ r }: { r: ImportRunResult }) {
  const sorted = r.companiesSorted || r.peopleSorted
  return (
    <div className="space-y-3 text-sm">
      {r.enriched && (
        <div className="rounded-md border px-3 py-3">
          <p className="font-medium">Filled in · {formatUsd(r.enriched.costUsd)}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{enrichSummary(r.enriched)}</p>
          {r.enriched.errors.length > 0 && <p className="text-[13px] text-destructive">Stopped early: {r.enriched.errors[0]}</p>}
        </div>
      )}
      <div className="rounded-md border px-3 py-3">
        <p className="font-medium tabular-nums">
          {n(r.added + r.updated)} of {n(r.totalRows)} rows imported
        </p>
        <ul className="mt-1 space-y-0.5 text-[13px] text-muted-foreground tabular-nums">
          <li>
            {n(r.added)} new, {n(r.updated)} already here and updated
          </li>
          <li>{n(r.leadsCreated)} became leads</li>
          {r.companiesAdded > 0 && <li>{n(r.companiesAdded)} companies added to Companies</li>}
          {r.duplicatesInFile > 0 && <li>{n(r.duplicatesInFile)} repeated in the file, imported once</li>}
          {r.errors.length > 0 && <li className="text-destructive">{n(r.errors.length)} rows couldn&apos;t be used</li>}
        </ul>
      </div>
      {sorted && (
        <div className="rounded-md border px-3 py-3">
          <p className="font-medium">Sorted by Claude · {formatUsd(r.costUsd)}</p>
          <ul className="mt-1 space-y-1 text-[13px] text-muted-foreground">
            {r.companiesSorted && <SortLine title="Companies" r={r.companiesSorted} />}
            {r.peopleSorted && <SortLine title="People" r={r.peopleSorted} />}
          </ul>
          <Link href="/smart-lists" className="mt-2 inline-block text-[13px] underline">
            Open Smart lists
          </Link>
        </div>
      )}
      {r.errors.length > 0 && (
        <ul className="max-h-32 overflow-y-auto text-xs text-destructive">
          {r.errors.slice(0, 50).map((e) => (
            <li key={e.row}>
              Row {e.row}: {e.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
