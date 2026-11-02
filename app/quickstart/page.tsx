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
import { fetchQuickstartRuns, startQuickstart, useApi } from "@/lib/api"
import { formatUsd, shortDate } from "@/lib/format"
import { useStore } from "@/lib/store"
import type { ICP } from "@/lib/types"

// What each step costs, at the prices Coldbrew uses elsewhere (Google Maps, Apify on the Bronze plan, Claude Haiku).
const PRICE = {
  googleRequest: 0.035,
  verify: 0.004, // website (free) + Instagram profile + Claude's score
  linkedinCompany: 0.02, // the LinkedIn actor's start fee, once per company
  linkedinPerson: 0.003,
  linkedinPersonWithEmail: 0.012,
  post: 0.002,
  write: 0.003, // hook, email and score
}

const hasOffer = (icp: ICP) => !!icp.productId || !!icp.offer.trim()

export default function QuickstartPage() {
  return (
    <>
      <PageHeader
        title="Quick Start"
        description="Pick an ICP and how much of each step. Coldbrew finds companies on Google Maps, verifies them, finds the right people and their emails, reads their posts and writes each email. You approve every email before anything is queued."
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
                    {r.settings.searchTerms.join(", ")} around {r.settings.places.join("; ")} · {shortDate(r.createdAt)}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {r.steps.write?.done ?? 0} drafts · {formatUsd(r.spentUsd)} of {formatUsd(r.spendLimitUsd)}
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
  const router = useRouter()
  const ready = icps.filter((i) => i.enabled && hasOffer(i))
  const [icpId, setIcpId] = useState("")
  const icp = icps.find((i) => i.id === icpId)
  const [terms, setTerms] = useState<string[]>([])
  const [places, setPlaces] = useState<string[]>([])
  const [titles, setTitles] = useState<string[]>([])
  const [n, setN] = useState({ radius: "10", requests: "4", companies: "10", people: "2", leads: "20", posts: "5", limit: "" })
  const [findEmails, setFindEmails] = useState(true)
  const [onlyWithEmail, setOnlyWithEmail] = useState(true)
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
  const lines = [
    { step: "Find companies (Google Maps)", cost: num("requests") * PRICE.googleRequest },
    { step: `Verify ${num("companies")} companies`, cost: num("companies") * PRICE.verify },
    {
      step: `Find up to ${people} people${findEmails ? " and their emails" : ""}`,
      cost: num("companies") * PRICE.linkedinCompany + people * (findEmails ? PRICE.linkedinPersonWithEmail : PRICE.linkedinPerson),
    },
    { step: `Read up to ${num("posts")} posts for ${leads} leads`, cost: leads * num("posts") * PRICE.post },
    { step: `Write ${leads} emails`, cost: leads * PRICE.write },
  ]
  const estimate = lines.reduce((sum, l) => sum + l.cost, 0)
  const limit = n.limit === "" ? Math.max(0.5, Math.ceil(estimate * 1.2 * 100) / 100) : Number(n.limit)

  const errors = [
    !icp && "Pick an ICP",
    !terms.length && "Add a search term",
    !places.length && "Add a place",
    !(num("requests") >= 2 && num("requests") <= 100) && "Google requests: 2 to 100",
    !(num("companies") >= 1 && num("companies") <= 100) && "Companies to verify: 1 to 100",
    !(num("people") >= 1 && num("people") <= 10) && "People per company: 1 to 10",
    !(num("leads") >= 1 && num("leads") <= 300) && "Most leads: 1 to 300",
    !(num("posts") >= 0 && num("posts") <= 20) && "Posts per lead: 0 to 20",
    !(limit > 0 && limit <= 500) && "Spend limit: above $0, up to $500",
  ].filter(Boolean) as string[]

  const start = async () => {
    if (errors.length || !icp) return
    setStarting(true)
    try {
      const run = await startQuickstart(wsId, {
        icpId: icp.id, searchTerms: terms, places, radiusMiles: num("radius"), googleRequests: num("requests"),
        companies: num("companies"), peoplePerCompany: num("people"), titles, findEmails, leads: num("leads"),
        onlyWithEmail, postsPerLead: num("posts"), maxPostAgeDays: icp.maxPostAgeDays ?? 60, spendLimitUsd: limit,
      })  // prettier-ignore
      toast.success("Quick Start is running", { description: "You can leave this page: it carries on in the background." })
      router.push(`/quickstart/${run.id}`)
    } catch (e) {
      toast.error("Couldn't start it", { description: e instanceof Error ? e.message : undefined })
      setStarting(false)
    }
  }

  const number = (k: keyof typeof n, label: string, hint: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`qs-${k}`}>{label}</Label>
      <Input id={`qs-${k}`} type="number" inputMode="numeric" className="w-28" value={n[k]} onChange={field(k)} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )

  return (
    <section className="space-y-6 rounded-lg border p-5">
      <h2 className="text-base font-semibold">New run</h2>

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
        <p className="text-xs text-muted-foreground">
          Only ICPs with a product or offer can be picked, so each email says what you sell. Set it on the ICP&apos;s{" "}
          <Link href="/icps" className="underline">
            Definition tab
          </Link>
          .
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="qs-terms">2. What to search Google Maps for</Label>
          <TagInput id="qs-terms" value={terms} onChange={setTerms} placeholder="screen printing" />
          <p className="text-xs text-muted-foreground">What you&apos;d type into Google Maps. Press Enter after each.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="qs-places">Where</Label>
          <TagInput places id="qs-places" value={places} onChange={setPlaces} placeholder="Austin, TX" />
          <p className="text-xs text-muted-foreground">US cities, states or postcodes, like Austin, TX. Press Enter after each.</p>
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium">3. How much of each step</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {number("radius", "Radius (miles)", "Around each place.")}
          {number("requests", "Google requests", "Each finds up to 20 businesses.")}
          {number("companies", "Companies to verify", "Website, Instagram and fit score.")}
          {number("people", "People per company", "Found on LinkedIn.")}
          {number("leads", "Most leads", "People who get an email.")}
          {number("posts", "Posts per lead", "0 writes without posts.")}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="qs-titles">Job titles to reach</Label>
          <TagInput id="qs-titles" value={titles} onChange={setTitles} placeholder="Owner, Founder" />
          <p className="text-xs text-muted-foreground">From the ICP. Empty: owners, founders, CEOs, presidents and general managers.</p>
        </div>
        <div className="space-y-3 pt-6">
          <Label className="flex cursor-pointer items-start gap-2 font-normal">
            <Checkbox checked={findEmails} onCheckedChange={(v) => setFindEmails(v === true)} className="mt-0.5" />
            <span>Find their work emails ($0.012 a person instead of $0.003)</span>
          </Label>
          <Label className="flex cursor-pointer items-start gap-2 font-normal">
            <Checkbox checked={onlyWithEmail} onCheckedChange={(v) => setOnlyWithEmail(v === true)} className="mt-0.5" />
            <span>Only make leads of people with an email (you can&apos;t send to the others)</span>
          </Label>
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
            <span>At most, if every company qualifies</span>
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
            <p className="text-xs text-muted-foreground">The run stops when it has spent this much.</p>
          </div>
          <ManagerOnly>
            <Button disabled={!!errors.length || starting} onClick={() => void start()} className="mb-6">
              <Rocket /> {starting ? "Starting…" : "Start Quick Start"}
            </Button>
          </ManagerOnly>
        </div>
        {errors.length > 0 && icp && <p className="text-xs text-destructive">{errors.join(" · ")}</p>}
        <p className="text-xs text-muted-foreground">
          Nothing is queued or sent: the run ends with drafts for you to approve, and queueing is still your call.
        </p>
      </div>
    </section>
  )
}
