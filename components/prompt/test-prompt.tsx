"use client"

import { useState } from "react"
import { FlaskConical, Loader2, Search, X } from "lucide-react"
import { toast } from "sonner"
import { ManagerOnly } from "@/components/manager-only"
import { Pill } from "@/components/status"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type PromptTestResult, type Stakeholder, testPrompt, useApi } from "@/lib/api"
import { fetchPeoplePage } from "@/lib/lists"
import { useDebounced } from "@/lib/use-debounced"
import { formatUsd } from "@/lib/format"
import type { VersionDraft } from "@/lib/store"
import type { PromptKind } from "@/lib/types"
import { cn } from "@/lib/utils"

/** The prompts a test can write with: the first email and each follow-up. */
export const TESTABLE_KINDS: PromptKind[] = ["email", "followup2", "followup3", "followup4", "followup5"]
const DAY: Record<number, number> = { 1: 1, 2: 3, 3: 6, 4: 10, 5: 16 }
const PER_CALL = 0.003 // one email on Haiku: hook, email and score, or one follow-up
const SOURCE = { tested: "This prompt", written: "Current prompt", saved: "Already saved" } as const

const name = (p: Stakeholder) => `${p.firstName} ${p.lastName}`.trim() || p.email || "Unnamed"

/**
 * Write a test email for one person with the prompt as it's being edited, saved or not. Nothing is saved or
 * sent. A follow-up shows the thread before it too: their saved first email, and the earlier follow-ups written
 * with the current prompts.
 */
export function TestPrompt({ wsId, kind, draft }: { wsId: string; kind: PromptKind; draft: VersionDraft }) {
  const [search, setSearch] = useState("")
  // The first 8 people with an email who match the search, found by the server (not everyone loaded to search here).
  const typed = useDebounced(search)
  const people = useApi(() => fetchPeoplePage(wsId, { archive: "all", email: "has", q: typed }, 1, 8), [wsId, typed])
  const [picked, setPicked] = useState<Stakeholder | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<PromptTestResult | null>(null)
  const step = kind === "email" ? 1 : Number(kind.replace("followup", ""))

  const matches: Stakeholder[] = people.data?.items ?? []

  const run = async () => {
    if (!picked) return
    setRunning(true)
    setResult(null)
    try {
      const r = await testPrompt(wsId, {
        kind: kind as Parameters<typeof testPrompt>[1]["kind"],
        stakeholderId: picked.id,
        systemPrompt: draft.systemPrompt,
        userPrompt: draft.userPrompt,
        model: draft.model,
        maxTokens: draft.maxTokens,
        maxPosts: draft.maxPosts,
      })
      setResult(r)
    } catch (e) {
      toast.error("Couldn't write the test email", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Test on a person</CardTitle>
        <CardDescription>
          Writes {step === 1 ? "their first email" : `email ${step} (day ${DAY[step]})`} with this prompt as it is now, saved or not,
          from everything a real run uses. Nothing is saved or sent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="test-person">Person</Label>
            {picked ? (
              <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{name(picked)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {[picked.title, picked.organizationName].filter(Boolean).join(", ")}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label="Pick someone else"
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setPicked(null)
                    setResult(null)
                  }}
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="test-person"
                  className="pl-8"
                  placeholder={people.data ? "Search by name, title, company or email" : "Loading people…"}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoComplete="off"
                />
              </div>
            )}
          </div>
          <ManagerOnly>
            <Button disabled={!picked || running} onClick={() => void run()}>
              {running ? <Loader2 className="animate-spin" /> : <FlaskConical />}
              {running ? "Writing…" : "Write a test email"}
            </Button>
          </ManagerOnly>
        </div>

        {!picked && (
          <ul className="divide-y divide-rule overflow-hidden rounded-md border" aria-label="People">
            {people.error ? (
              <li className="px-3 py-2.5 text-sm text-destructive">Couldn&apos;t load people: {people.error}</li>
            ) : !people.data ? (
              <li className="px-3 py-2.5 text-sm text-muted-foreground">Loading people…</li>
            ) : matches.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-muted-foreground">No one with an email matches.</li>
            ) : (
              matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50"
                    onClick={() => setPicked(p)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{name(p)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[p.title, p.organizationName].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="flex-none text-xs text-muted-foreground">{p.email}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          About {formatUsd(PER_CALL * step)}
          {step > 1 ? `: emails 2 to ${step - 1} are written first with the current prompts, so this one has its thread` : ""}.
          {step > 1 ? " Their saved first email is used; without one, a first email is written too." : ""} Logged on Usage.
        </p>

        {running && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> Writing{step > 1 ? ` ${step} emails` : ""}… this can take a minute.
          </p>
        )}

        {result && (
          <section className="space-y-3" aria-label="Test result">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {result.name}
                {result.company ? <span className="font-normal text-muted-foreground"> · {result.company}</span> : null}
              </h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {result.score !== null ? `Score ${result.score} · ` : ""}
                {result.confidence !== null ? `Confidence ${result.confidence} · ` : ""}
                {formatUsd(result.costUsd)}
              </span>
            </div>
            <ol className="space-y-3">
              {result.emails.map((e) => (
                <li
                  key={e.step}
                  className={cn("rounded-md border p-4", e.source === "tested" ? "border-primary/50 bg-primary/[0.03]" : "bg-muted/20")}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Email {e.step} · day {DAY[e.step]}
                    </span>
                    <Pill tone={e.source === "tested" ? "info" : "neutral"}>{SOURCE[e.source]}</Pill>
                  </div>
                  {e.subject && <p className="mb-2 text-sm font-medium">{e.subject}</p>}
                  <p className="text-sm whitespace-pre-wrap">{e.body}</p>
                </li>
              ))}
            </ol>
            {(result.hook || result.reasons.length > 0) && (
              <div className="space-y-1 text-xs text-muted-foreground">
                {result.hook && (
                  <p>
                    <span className="font-medium text-foreground">Hook:</span> {result.hook}
                  </p>
                )}
                {result.reasons.length > 0 && (
                  <p>
                    <span className="font-medium text-foreground">Why that score:</span> {result.reasons.join(" · ")}
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  )
}
