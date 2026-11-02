"use client"

import { useState } from "react"
import { AlertTriangle, UserSearch } from "lucide-react"
import { Pill } from "@/components/status"
import { TagInput } from "@/components/tag-input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type StakeholderSearchResult, findPipelineStakeholders } from "@/lib/api"
import { formatUsd } from "@/lib/format"
import { cn } from "@/lib/utils"

const SENIORITIES: { value: string; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "founder", label: "Founder" },
  { value: "c_suite", label: "C-suite" },
  { value: "partner", label: "Partner" },
  { value: "vp", label: "VP" },
  { value: "head", label: "Head of" },
  { value: "director", label: "Director" },
  { value: "manager", label: "Manager" },
]

const SOURCES = [
  { value: "apollo", label: "Apollo", hint: "Needs a paid Apollo plan. Searching uses no credits; revealing an email is about 1 credit." },
  { value: "linkedin", label: "LinkedIn (Apify)", hint: "Names, titles, LinkedIn and work emails. $0.02 per company searched, plus about $0.012 per person." },
] as const

const DEFAULT_TITLES = ["Owner", "Founder", "CEO", "President", "General Manager"]
const DEFAULT_SENIORITIES = ["owner", "founder", "c_suite"]
// What Apify charged on 2026-10-31 (Bronze plan): $0.02 each time the actor starts, which is once per
// company, plus $0.003 per Basic profile.
const LINKEDIN_COST_PER_COMPANY = 0.02
const LINKEDIN_COST_PER_PERSON = 0.003
// With the email search, which also returns the full profile: $12 per 1,000 people.
const LINKEDIN_COST_PER_PERSON_WITH_EMAIL = 0.012

type Result = StakeholderSearchResult & { costUsd?: number | null }

/** Find the people at these qualified companies: in Apollo (paid plans only) or on LinkedIn through Apify (paid per person). */
export function FindStakeholdersDialog({
  workspaceId,
  companies,
  onClose,
  onDone,
}: {
  workspaceId: string
  companies: { id: string; name: string; domain: string | null }[]
  onClose: () => void
  /** Called after a search that saved anyone, so lists can reload. */
  onDone: () => void
}) {
  const [source, setSource] = useState<"apollo" | "linkedin">("apollo")
  const [titles, setTitles] = useState(DEFAULT_TITLES)
  const [seniorities, setSeniorities] = useState(DEFAULT_SENIORITIES)
  const [perCompany, setPerCompany] = useState("10")
  const [findEmails, setFindEmails] = useState(true)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [failure, setFailure] = useState("")

  const linkedin = source === "linkedin"
  // Apollo searches by website domain; LinkedIn (Apify) looks the company up by name.
  const noDomain = linkedin ? [] : companies.filter((c) => !c.domain)
  const limit = linkedin ? 10 : 25
  const tooMany = companies.length > limit
  const max = Number(perCompany)
  const badMax = linkedin && !(Number.isInteger(max) && max >= 1 && max <= 50)
  const perPerson = findEmails ? LINKEDIN_COST_PER_PERSON_WITH_EMAIL : LINKEDIN_COST_PER_PERSON
  const estimate = linkedin && !badMax ? companies.length * (LINKEDIN_COST_PER_COMPANY + max * perPerson) : 0

  const run = async () => {
    setRunning(true)
    setFailure("")
    try {
      const r: Result = await findPipelineStakeholders(workspaceId, {
        companyIds: companies.map((c) => c.id),
        source,
        titles,
        seniorities: linkedin ? [] : seniorities,
        maxPerCompany: linkedin ? max : 10,
        findEmails: linkedin && findEmails,
      })
      setResult(r)
      if (r.results.some((x) => x.new > 0)) onDone()
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "The search failed.")
    } finally {
      setRunning(false)
    }
  }

  const name = companies.length === 1 ? companies[0].name : `${companies.length} companies`

  return (
    <Dialog open onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg!">
        <DialogHeader>
          <DialogTitle>Find stakeholders at {name}</DialogTitle>
          <DialogDescription>
            {linkedin
              ? "Finds people on LinkedIn through Apify, looking each company up by name. Paid per person found."
              : "Searches Apollo by each company's website domain. Needs a paid Apollo plan; searching uses no credits, revealing an email does. Only qualified companies are searched."}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            {result.error && (
              <p className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 flex-none text-warning" />
                <span>
                  <span className="font-medium">{linkedin ? "Apify" : "Apollo"} refused the search.</span> {result.error}
                </span>
              </p>
            )}
            {!!result.costUsd && (
              <p className="text-[13px] text-muted-foreground tabular-nums">Apify charged {formatUsd(result.costUsd)} for this search.</p>
            )}
            <ul className="divide-y divide-rule rounded-md border">
              {result.results.map((r) => (
                <li key={r.companyId} className="flex items-start gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.name ?? "Unknown company"}</span>
                    {r.reason && r.reason !== result.error && (
                      <span className="block text-[13px] text-muted-foreground">{r.reason}</span>
                    )}
                  </span>
                  {r.status === "searched" ? (
                    <span className="text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
                      {r.found} found{r.new !== r.found ? `, ${r.new} new` : ""}
                      {r.totalAtApollo && r.totalAtApollo > r.found ? ` (of ${r.totalAtApollo})` : ""}
                    </span>
                  ) : (
                    <Pill tone={r.status === "failed" ? "negative" : "neutral"}>{r.status === "failed" ? "Failed" : "Skipped"}</Pill>
                  )}
                </li>
              ))}
            </ul>
            {linkedin && result.results.some((r) => r.found > 0) && (
              <p className="text-[13px] text-muted-foreground">
                Companies are matched by name on LinkedIn, so check the people found work at the right one.
              </p>
            )}
          </div>
        ) : (
          <form
            id="find-stakeholders"
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault()
              if (!tooMany && !badMax) void run()
            }}
          >
            <div role="radiogroup" aria-label="Search with" className="grid grid-cols-2 gap-2">
              {SOURCES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={source === o.value}
                  onClick={() => setSource(o.value)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    source === o.value ? "border-data bg-data/5" : "hover:bg-muted/60",
                  )}
                >
                  <span className="block text-sm font-medium">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">{o.hint}</span>
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stakeholder-titles">Job titles</Label>
              <TagInput id="stakeholder-titles" value={titles} onChange={setTitles} placeholder="Add a title and press Enter" />
              <p className="text-xs text-muted-foreground">
                {linkedin
                  ? "Their current title on LinkedIn must match one of these. Leave empty for anyone at the company."
                  : "A person needs to match one of these. Similar titles count too. Leave empty to match any title."}
              </p>
            </div>

            {linkedin ? (
              <div className="space-y-1.5">
                <Label htmlFor="stakeholder-per-company">People per company, at most</Label>
                <Input
                  id="stakeholder-per-company"
                  type="number"
                  inputMode="numeric"
                  className="w-28"
                  value={perCompany}
                  onChange={(e) => setPerCompany(e.target.value)}
                  aria-invalid={badMax || undefined}
                />
                <p className={badMax ? "text-xs text-destructive" : "text-xs text-muted-foreground tabular-nums"}>
                  {badMax ? "Use a whole number from 1 to 50" : `Up to about ${formatUsd(estimate)} for this search.`}
                </p>
                <Label className="flex cursor-pointer items-start gap-2 pt-2 text-sm font-normal">
                  <Checkbox checked={findEmails} onCheckedChange={(v) => setFindEmails(v === true)} className="mt-0.5" />
                  <span>
                    Find their work emails too
                    <span className="block text-xs text-muted-foreground">
                      Needed to send to them. Each email comes with a check: valid, or risky when the company accepts any
                      address. Also brings their full profile (work history, about), which makes better emails.
                    </span>
                  </span>
                </Label>
              </div>
            ) : (
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Seniority</legend>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                  {SENIORITIES.map((s) => (
                    <Label key={s.value} className="flex cursor-pointer items-center gap-2 text-sm font-normal">
                      <Checkbox
                        checked={seniorities.includes(s.value)}
                        onCheckedChange={(v) =>
                          setSeniorities((list) => (v === true ? [...list, s.value] : list.filter((x) => x !== s.value)))
                        }
                      />
                      {s.label}
                    </Label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Based on their current job. Leave all unticked for any seniority.</p>
              </fieldset>
            )}

            {noDomain.length > 0 && (
              <p className="text-[13px] text-muted-foreground">
                {companies.length === 1
                  ? "This company has no website domain in Lead Intel to search by, so it will be skipped."
                  : noDomain.length === companies.length
                    ? "None of these have a website domain in Lead Intel to search by, so all will be skipped."
                    : `${noDomain.length} of these have no website domain in Lead Intel and will be skipped.`}
              </p>
            )}
            {tooMany && <p className="text-sm text-destructive">Pick {limit} companies or fewer per search.</p>}
            {failure && <p className="text-sm text-destructive">{failure}</p>}
          </form>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={running}>
                Cancel
              </Button>
              <Button type="submit" form="find-stakeholders" disabled={running || tooMany || badMax}>
                <UserSearch />{" "}
                {running ? (linkedin ? "Searching LinkedIn… this can take a minute" : "Searching…") : linkedin ? "Search LinkedIn" : "Search Apollo"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
