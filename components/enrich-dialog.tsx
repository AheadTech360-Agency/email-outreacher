"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { type EnrichOptions, type EnrichResult, type Job, enrichCompanies, enrichPeople } from "@/lib/api"
import { ENRICH_COST, enrichSummary } from "@/lib/costs"
import { formatUsd } from "@/lib/format"

const n = (x: number) => x.toLocaleString()

/** The choices, each off until ticked: what filling in companies (and optionally their people) reads, and costs. */
export function EnrichChoices({
  companies,
  people,
  value,
  onChange,
}: {
  companies: number
  people: number
  value: EnrichOptions & { people: boolean }
  onChange: (next: EnrichOptions & { people: boolean }) => void
}) {
  const rows: { key: keyof typeof value; label: string; hint: string; show: boolean }[] = [
    { key: "website", label: "Read their websites", hint: "Socials, emails, phone and page text. Free.", show: companies > 0 },
    {
      key: "instagram",
      label: "Instagram profiles",
      hint: `Bio, category, followers and latest posts, where the site links one. Up to ${formatUsd(companies * ENRICH_COST.instagram)}.`,
      show: companies > 0,
    },
    {
      key: "linkedin",
      label: "LinkedIn company pages",
      hint: `About, size, founded, specialties. Up to ${formatUsd(companies * ENRICH_COST.linkedinCompany)}.`,
      show: companies > 0,
    },
    {
      key: "people",
      label: "People's LinkedIn profiles",
      hint: `About, experience, education, skills; used when emails are written. Up to ${formatUsd(people * ENRICH_COST.linkedinProfile)}.`,
      show: people > 0,
    },
  ]
  return (
    <div className="space-y-2.5">
      {rows
        .filter((r) => r.show)
        .map((r) => (
          <label key={r.key} className="flex cursor-pointer items-start gap-2.5 text-sm">
            <Checkbox className="mt-0.5" checked={value[r.key]} onCheckedChange={(v) => onChange({ ...value, [r.key]: v === true })} />
            <span>
              {r.label}
              <span className="block text-xs text-muted-foreground">{r.hint}</span>
            </span>
          </label>
        ))}
      <p className="text-xs text-muted-foreground">No AI is used. Anything already filled in isn&apos;t bought again. Costs are logged on Usage.</p>
    </div>
  )
}

export const NO_ENRICH = { website: false, instagram: false, linkedin: false, people: false }

/** Fill in companies (and/or people) chosen on a page. */
export function EnrichDialog({
  wsId,
  companyIds = [],
  personIds = [],
  onClose,
  onDone,
}: {
  wsId: string
  companyIds?: string[]
  personIds?: string[]
  onClose: () => void
  onDone: () => void
}) {
  const [choice, setChoice] = useState(NO_ENRICH)
  const [job, setJob] = useState<Job | null>(null)
  const [running, setRunning] = useState(false)
  const anything = choice.website || choice.instagram || choice.linkedin || choice.people

  const run = async () => {
    setRunning(true)
    try {
      const parts: EnrichResult[] = []
      if (companyIds.length && (choice.website || choice.instagram || choice.linkedin))
        parts.push(await enrichCompanies(wsId, companyIds, choice, setJob))
      if (personIds.length && choice.people) parts.push(await enrichPeople(wsId, personIds, setJob))
      const sum = (k: "sitesRead" | "sitesFailed" | "instagram" | "linkedinCompanies" | "linkedinPeople" | "postsSaved" | "costUsd") =>
        parts.reduce((s, p) => s + p[k], 0)
      const errors = parts.flatMap((p) => p.errors)
      const summary = enrichSummary({
        sitesRead: sum("sitesRead"), sitesFailed: sum("sitesFailed"), instagram: sum("instagram"),
        linkedinCompanies: sum("linkedinCompanies"), linkedinPeople: sum("linkedinPeople"), postsSaved: sum("postsSaved"),
      }) // prettier-ignore
      if (errors.length) toast.error("Stopped early", { description: `${errors[0]} ${summary}` })
      else toast.success(summary, { description: `Apify charged ${formatUsd(sum("costUsd"))}.` })
      onDone()
      onClose()
    } catch (e) {
      toast.error("Couldn't fill them in", { description: e instanceof Error ? e.message : undefined })
      setRunning(false)
    }
  }

  const what = [
    companyIds.length ? `${n(companyIds.length)} ${companyIds.length === 1 ? "company" : "companies"}` : "",
    personIds.length ? `${n(personIds.length)} ${personIds.length === 1 ? "person" : "people"}` : "",
  ]
    .filter(Boolean)
    .join(" and ")

  return (
    <Dialog open onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className="sm:max-w-md!">
        <DialogHeader>
          <DialogTitle>Fill in {what}</DialogTitle>
          <DialogDescription>They aren&apos;t judged again: this only reads what&apos;s out there about them.</DialogDescription>
        </DialogHeader>
        {running ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {job?.step ?? "Starting"}
            {job?.total ? ` · ${n(job.done)} of ${n(job.total)}` : ""}
          </p>
        ) : (
          <EnrichChoices companies={companyIds.length} people={personIds.length} value={choice} onChange={setChoice} />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button disabled={!anything || running} onClick={() => void run()}>
            {running ? "Filling in…" : "Fill in"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
