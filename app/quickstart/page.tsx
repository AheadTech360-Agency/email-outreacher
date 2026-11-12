"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Rocket } from "lucide-react"
import { toast } from "sonner"
import { WorkspaceGate } from "@/components/companies/backend-state"
import { EmptyState } from "@/components/empty-state"
import { ManagerOnly } from "@/components/manager-only"
import { PageHeader } from "@/components/page-header"
import { RUN_STATUS } from "@/components/quickstart/run-status"
import { Pill } from "@/components/status"
import { TagInput } from "@/components/tag-input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetchQuickstartLimits, fetchQuickstartRuns, fetchSmartLists, runWhere, startQuickstart, useApi } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { ENRICH_COST } from "@/lib/costs"
import { formatUsd, shortDate } from "@/lib/format"
import { isProspector } from "@/lib/roles"
import { useStore } from "@/lib/store"
import type { ICP } from "@/lib/types"

// What each step costs, at the prices Coldbrew uses elsewhere (Google Maps, Apify on the Bronze plan, Claude Haiku).
const PRICE = {
  googleRequest: 0.035,
  // Filling in what's missing (lib/costs ENRICH_COST): a person's LinkedIn profile, a company's Instagram and LinkedIn page.
  profile: ENRICH_COST.linkedinProfile,
  instagramProfile: ENRICH_COST.instagram,
  linkedinPage: ENRICH_COST.linkedinCompany,
  verify: 0.004, // website (free) + Instagram profile + Claude's score
  linkedinCompany: 0.02, // the LinkedIn actor's start fee, once per company
  linkedinPerson: 0.003,
  linkedinPersonWithEmail: 0.012,
  post: 0.002,
  write: 0.003, // hook, email and score
  linkedinSearch: 0.004, // a company from LinkedIn's company search, with its details
  brief: 0.002, // a company's brief (Claude Haiku)
  googleSearch: 0.0045, // a page of Google results through Apify (less on paid Apify plans)
}

const hasOffer = (icp: ICP) => !!icp.productId || !!icp.offer.trim()

export default function QuickstartPage() {
  return (
    <>
      <PageHeader
        title="Quick Start"
        description="From a search, or the companies you imported, to ready-to-approve emails in one go. You approve every email before anything is sent."
      />
      <div className="space-y-8 px-4 pb-10 md:px-8">
        <WorkspaceGate>{(wsId) => <QuickstartHome key={wsId} wsId={wsId} />}</WorkspaceGate>
      </div>
    </>
  )
}

function QuickstartHome({ wsId }: { wsId: string }) {
  const runs = useApi(() => fetchQuickstartRuns(wsId), [wsId])
  return (
    <>
      <NewRun wsId={wsId} />
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Recent runs</h2>
        {runs.data && runs.data.length === 0 ? (
          <EmptyState icon={Rocket} title="No runs yet" description="Your first run shows up here, with its progress." />
        ) : (
          <div className="divide-y divide-rule rounded-lg border">
            {(runs.data ?? []).map((r) => (
              <Link key={r.id} href={`/quickstart/${r.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{r.icpName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {runWhere(r.settings)} · {shortDate(r.createdAt)}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {r.settings.source === "linkedin" ? `${r.steps.analysis?.done ?? 0} briefs` : `${r.steps.write?.done ?? 0} drafts`} · {formatUsd(r.spentUsd)} of {formatUsd(r.spendLimitUsd)}
                </span>
                <Pill tone={RUN_STATUS[r.status].tone}>{RUN_STATUS[r.status].label}</Pill>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function NewRun({ wsId }: { wsId: string }) {
  const { icps } = useStore()
  const { me } = useAuth()
  const router = useRouter()
  // A Prospector only has the LinkedIn option, free web search, and the workspace's most per run.
  const prospector = isProspector(me?.role)
  const limits = useApi(() => (prospector ? fetchQuickstartLimits(wsId) : Promise.resolve(null)), [wsId, prospector])
  const cap = limits.data?.spendLimitUsd ?? null
  const ready = icps.filter((i) => i.enabled && hasOffer(i))
  const [picked, setSource] = useState<"google_maps" | "existing" | "linkedin">("google_maps")
  const source = prospector ? "linkedin" : picked
  const existing = source === "existing"
  const linkedin = source === "linkedin"
  const lists = useApi(() => (prospector ? Promise.resolve(null) : fetchSmartLists(wsId, "company")), [wsId, prospector])
  const [listId, setListId] = useState("all")
  const [findPeople, setFindPeople] = useState(true)
  const [icpId, setIcpId] = useState("")
  const icp = icps.find((i) => i.id === icpId)
  const [terms, setTerms] = useState<string[]>([])
  const [places, setPlaces] = useState<string[]>([])
  const [titles, setTitles] = useState<string[]>([])
  const [n, setN] = useState({ radius: "10", requests: "20", companies: "10", people: "2", leads: "20", posts: "5", limit: "" })
  const [findEmails, setFindEmails] = useState(true)
  const [onlyWithEmail, setOnlyWithEmail] = useState(true)
  // The LinkedIn option's web searches: Brave (free, 1,000 a month) unless Google through Apify is chosen.
  const [googleSearch, setGoogleSearch] = useState(false)
  const [starting, setStarting] = useState(false)

  const pick = (id: string) => {
    const chosen = icps.find((i) => i.id === id)
    setIcpId(id)
    setTerms(chosen?.searchTerms ?? [])
    setPlaces(chosen?.places ?? [])
    setTitles(chosen?.titles ?? [])
  }
  const num = (k: keyof typeof n) => Number(n[k])
  const field = (k: keyof typeof n) => (e: React.ChangeEvent<HTMLInputElement>) => setN((x) => ({ ...x, [k]: e.target.value }))

  // The most each step can cost: every company qualifies and every person becomes a lead.
  const people = num("companies") * num("people")
  const leads = Math.min(num("leads"), people)
  const peopleCost = num("companies") * PRICE.linkedinCompany + people * (findEmails ? PRICE.linkedinPersonWithEmail : PRICE.linkedinPerson)
  const lines = linkedin
    ? [
        { step: `Find ${num("companies")} companies on LinkedIn`, cost: num("companies") * PRICE.linkedinSearch },
        googleSearch
          ? { step: `Search Google for their websites, socials and people (up to ${num("companies") * 4} searches)`, cost: num("companies") * 4 * PRICE.googleSearch }
          : { step: `Search the web for their websites, socials and people (Brave, free: up to ${num("companies") * 4} of 1,000 a month)`, cost: 0 },
        { step: `Verify ${num("companies")} companies`, cost: num("companies") * PRICE.verify },
        { step: `Find up to ${people} people${findEmails ? " and their emails" : ""}`, cost: peopleCost },
        { step: "Where LinkedIn finds no one: their profiles from a web search (at most)", cost: people * PRICE.profile },
      ]
    : existing
    ? [
        { step: `Take ${num("companies")} of your companies (already verified)`, cost: 0 },
        { step: "Read the websites not read yet (no AI)", cost: 0 },
        ...(findPeople
          ? [{ step: `Find people on LinkedIn where no one has a verified email yet (at most)`, cost: peopleCost }]
          : []),
        {
          step: `Fill in profiles for the ${leads} people written to and their companies, where not read yet`,
          cost: leads * (PRICE.profile + PRICE.instagramProfile + PRICE.linkedinPage),
        },
      ]
    : [
        { step: "Find companies (Google Maps)", cost: num("requests") * PRICE.googleRequest },
        { step: `Verify ${num("companies")} companies`, cost: num("companies") * PRICE.verify },
        { step: `Find up to ${people} people${findEmails ? " and their emails" : ""}`, cost: peopleCost },
      ]
  lines.push({ step: `Read up to ${num("posts")} posts for ${leads} people`, cost: leads * num("posts") * PRICE.post })
  // The LinkedIn option ends with a brief per company; the others write the emails.
  lines.push(linkedin ? { step: `Analyse ${num("companies")} companies: hooks to use`, cost: num("companies") * PRICE.brief }
    : { step: `Write ${leads} emails`, cost: leads * PRICE.write })
  // One lookup per place, and about 3 requests (one full set of 60) for each term in each place.
  const requestsNeeded = places.length + terms.length * places.length * 3
  const estimate = lines.reduce((sum, l) => sum + l.cost, 0)
  const suggested = Math.max(0.5, Math.ceil(estimate * 1.2 * 100) / 100)
  const limit = n.limit === "" ? (cap !== null ? Math.min(suggested, cap) : suggested) : Number(n.limit)

  const errors = [
    !icp && "Pick an ICP",
    !existing && !terms.length && "Add a search term",
    source === "google_maps" && !places.length && "Add a place",
    source === "google_maps" && !(num("radius") >= 1 && num("radius") <= 50) && "Radius: 1 to 50 miles (for a wider area, add a state or the United States)",
    source === "google_maps" && !(num("requests") >= 2 && num("requests") <= 100) && "Google requests: 2 to 100",
    !(num("companies") >= 1 && num("companies") <= (existing ? 2000 : linkedin ? 200 : 100)) && `Companies: 1 to ${existing ? "2,000" : linkedin ? 200 : 100}`,
    !(num("people") >= 1 && num("people") <= 10) && "People per company: 1 to 10",
    !(num("leads") >= 1 && num("leads") <= 2000) && "Most leads: 1 to 2,000",
    !(num("posts") >= 0 && num("posts") <= 20) && "Posts per lead: 0 to 20",
    !(limit > 0 && limit <= 500) && "Spend limit: above $0, up to $500",
    cap !== null && limit > cap && `Spend limit: your runs can spend at most ${formatUsd(cap)}`,
    prospector && limits.data === undefined && !limits.error && "Loading your spend limit",
  ].filter(Boolean) as string[]

  const start = async () => {
    if (errors.length || !icp) return
    setStarting(true)
    try {
      const run = await startQuickstart(wsId, {
        icpId: icp.id, source, smartListId: existing && listId !== "all" ? listId : null, findPeople,
        searchTerms: existing ? [] : terms, places: existing ? [] : places, radiusMiles: num("radius"), googleRequests: num("requests"),
        companies: num("companies"), peoplePerCompany: num("people"), titles, findEmails, leads: num("leads"),
        onlyWithEmail, postsPerLead: num("posts"), maxPostAgeDays: icp.maxPostAgeDays ?? 60, spendLimitUsd: limit,
        webSearch: googleSearch ? "google" : "brave",
      })  // prettier-ignore
      toast.success("Quick Start is running", { description: "You can leave this page: it carries on in the background." })
      router.push(`/quickstart/${run.id}`)
    } catch (e) {
      toast.error("Couldn't start it", { description: e instanceof Error ? e.message : undefined })
      setStarting(false)
    }
  }

  const number = (k: keyof typeof n, label: string, hint: string, warn = false) => (
    <div className="space-y-1.5">
      <Label htmlFor={`qs-${k}`}>{label}</Label>
      <Input id={`qs-${k}`} type="number" inputMode="numeric" className="w-28" value={n[k]} onChange={field(k)} />
      <p className={warn ? "text-xs text-amber-700 dark:text-amber-400" : "text-xs text-muted-foreground"}>{hint}</p>
    </div>
  )

  return (
    <section className="space-y-6 rounded-lg border p-5">
      <h2 className="text-base font-semibold">New run</h2>

      {!prospector && (
      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Which companies">
        {([
          ["google_maps", "Find new companies", "Search Google Maps, verify what it finds, then find the people there."],
          ["existing", "Use companies I already have", "The ones you imported: already verified, and their people came with them."],
          ["linkedin", "Find on LinkedIn", "Search LinkedIn, find their websites and socials, verify, find the people, then get a brief on each with the hooks to use."],
        ] as const).map(([key, title, hint]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={source === key}
            onClick={() => setSource(key)}
            className={`rounded-lg border p-3 text-left transition-colors ${source === key ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
          >
            <span className="block text-sm font-medium">{title}</span>
            <span className="block text-xs text-muted-foreground">{hint}</span>
          </button>
        ))}
      </div>
      )}
      {prospector && (
        <p className="text-sm text-muted-foreground">
          Search LinkedIn, find their websites and socials, verify them, find the people, then get a brief on each with the hooks to use.
        </p>
      )}

      <div className="space-y-1.5">
        <Label>1. Who are you after?</Label>
        <Select value={icpId} onValueChange={pick}>
          <SelectTrigger className="w-full! sm:w-80!" aria-label="ICP">
            <SelectValue placeholder="Pick an ICP" />
          </SelectTrigger>
          <SelectContent>
            {icps.map((i) => (
              <SelectItem key={i.id} value={i.id} disabled={!ready.includes(i)}>
                {i.name}
                {!ready.includes(i) && " (add a product or offer first)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {prospector ? (
          <p className="text-xs text-muted-foreground">Only ICPs with a product or offer can be picked. Ask Management to set one up.</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Only ICPs with a product or offer can be picked, so each email says what you sell. Set it on the ICP&apos;s{" "}
            <Link href="/icps" className="underline">
              Definition tab
            </Link>
            .
          </p>
        )}
      </div>

      {existing ? (
        <div className="space-y-1.5">
          <Label>2. Which of your companies</Label>
          <Select value={listId} onValueChange={setListId}>
            <SelectTrigger className="w-full! sm:w-80!" aria-label="Smart list">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All of this ICP&apos;s companies</SelectItem>
              {(lists.data?.lists ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  Only the smart list {l.name} ({l.count.toLocaleString()})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Only companies no one has written to yet, best score first. Each run picks up where the last one stopped.
          </p>
        </div>
      ) : (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="qs-terms">2. What to search {linkedin ? "LinkedIn" : "Google Maps"} for</Label>
          <TagInput id="qs-terms" value={terms} onChange={setTerms} placeholder="screen printing" />
          <p className="text-xs text-muted-foreground">
            {linkedin ? "Searched on LinkedIn one after another until the limit." : "What you'd type into Google Maps."} Press Enter after each.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qs-places">Where{linkedin ? " (optional)" : ""}</Label>
          <TagInput places id="qs-places" value={places} onChange={setPlaces} placeholder="Austin, TX" />
          <p className="text-xs text-muted-foreground">
            {linkedin
              ? "Cities, states or countries as LinkedIn names them, like Austin or United States. Empty searches everywhere."
              : "US cities or postcodes, like Austin, TX, or a whole state or the United States (searched in full)."}{" "}
            Press Enter after each.
          </p>
        </div>
      </div>
      )}

      <div>
        <p className="mb-3 text-sm font-medium">3. How much of each step</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {source === "google_maps" && number("radius", "Radius (miles)", "1 to 50, around each city. A state or country is searched in full.")}
          {source === "google_maps" &&
            number(
              "requests",
              "Google requests",
              num("requests") < requestsNeeded
                ? `Too few for ${terms.length * places.length} searches: about ${requestsNeeded} lets each one run.`
                : "Each finds up to 20 businesses.",
              num("requests") < requestsNeeded,
            )}
          {existing
            ? number("companies", "Companies", "Up to 2,000 a run. The rest wait for the next one.")
            : linkedin
              ? number("companies", "Companies to find", "Up to 200 a run, new ones only.")
              : number("companies", "Companies to verify", "Of those found. The rest wait on the Companies page.")}
          {number("people", "People per company", existing ? "Those with an email first." : "Found on LinkedIn.")}
          {number("leads", linkedin ? "Most people" : "Most emails", linkedin ? "People whose posts are read." : "People who get an email.")}
          {number("posts", "Posts per person", linkedin ? "0 skips reading posts." : "0 writes without posts.")}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="qs-titles">Job titles to reach</Label>
          <TagInput id="qs-titles" value={titles} onChange={setTitles} placeholder="Owner, Founder" />
          <p className="text-xs text-muted-foreground">From the ICP. Empty: owners, founders, CEOs, presidents and general managers.</p>
        </div>
        <div className="space-y-3 pt-6">
          {existing && (
            <Label className="flex cursor-pointer items-start gap-2 font-normal">
              <Checkbox checked={findPeople} onCheckedChange={(v) => setFindPeople(v === true)} className="mt-0.5" />
              <span>Look on LinkedIn at companies where no one has an email yet</span>
            </Label>
          )}
          <Label className="flex cursor-pointer items-start gap-2 font-normal">
            <Checkbox checked={findEmails} onCheckedChange={(v) => setFindEmails(v === true)} className="mt-0.5" />
            <span>Find their work emails ($0.012 a person instead of $0.003)</span>
          </Label>
          <Label className="flex cursor-pointer items-start gap-2 font-normal">
            <Checkbox checked={onlyWithEmail} onCheckedChange={(v) => setOnlyWithEmail(v === true)} className="mt-0.5" />
            <span>Only make leads of people with an email (you can&apos;t send to the others)</span>
          </Label>
          {linkedin && !prospector && (
            <Label className="flex cursor-pointer items-start gap-2 font-normal">
              <Checkbox checked={googleSearch} onCheckedChange={(v) => setGoogleSearch(v === true)} className="mt-0.5" />
              <span>
                Search Google instead of Brave, through Apify (about $0.005 a search). Brave is free for 1,000 searches a month
                and finds less.
              </span>
            </Label>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">4. What it can cost</p>
        <div className="divide-y divide-rule rounded-md border text-sm">
          {lines.map((l) => (
            <div key={l.step} className="flex justify-between px-3 py-1.5">
              <span>{l.step}</span>
              <span className="tabular-nums">{formatUsd(l.cost)}</span>
            </div>
          ))}
          <div className="flex justify-between px-3 py-1.5 font-medium">
            <span>{existing ? "At most" : "At most, if every company qualifies"}</span>
            <span className="tabular-nums">{formatUsd(estimate)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="qs-limit">Spend limit (USD)</Label>
            <Input
              id="qs-limit"
              type="number"
              inputMode="decimal"
              className="w-28"
              placeholder={limit.toFixed(2)}
              value={n.limit}
              onChange={field("limit")}
            />
            <p className="text-xs text-muted-foreground">
              The run stops when it has spent this much.{cap !== null && ` Your runs can spend up to ${formatUsd(cap)}.`}
            </p>
          </div>
          <ManagerOnly runner>
            <Button disabled={!!errors.length || starting} onClick={() => void start()} className="mb-6">
              <Rocket /> {starting ? "Starting…" : "Start Quick Start"}
            </Button>
          </ManagerOnly>
        </div>
        {errors.length > 0 && icp && <p className="text-xs text-destructive">{errors.join(" · ")}</p>}
        <p className="text-xs text-muted-foreground">
          {linkedin
            ? "Nothing is written or sent: the run ends with a brief on each company and the hooks to use."
            : "Nothing is queued or sent: the run ends with drafts for you to approve, and queueing is still your call."}
        </p>
      </div>
    </section>
  )
}
