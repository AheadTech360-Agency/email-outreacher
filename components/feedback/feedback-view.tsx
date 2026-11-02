"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ExternalLink, Mail, MessageSquareText, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react"
import { toast } from "sonner"
import { BackendError, WorkspaceGate } from "@/components/companies/backend-state"
import { EmptyState } from "@/components/empty-state"
import { FeedbackControl, TAG_LABEL } from "@/components/feedback/feedback-control"
import { ManagerOnly } from "@/components/manager-only"
import { PageHeader } from "@/components/page-header"
import { Pill } from "@/components/status"
import { TableSkeleton } from "@/components/table-skeleton"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  type ApiIcp,
  type EmailDraft,
  type PromptSuggestion,
  fetchEmails,
  fetchIcps,
  rateEmail,
  saveEmailAsExample,
  suggestEmailPrompt,
  useApi,
} from "@/lib/api"
import { formatUsd, shortDate } from "@/lib/format"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

const MIN_RATED = 3
const FILTERS = [
  { value: "unrated", label: "Not rated", test: (d: EmailDraft) => !d.feedback },
  { value: "good", label: "Good", test: (d: EmailDraft) => d.feedback?.rating === "good" },
  { value: "bad", label: "Bad", test: (d: EmailDraft) => d.feedback?.rating === "bad" },
  { value: "all", label: "All", test: () => true },
]

const name = (d: EmailDraft) => `${d.lead.firstName} ${d.lead.lastName}`.trim() || d.lead.email || "Unnamed lead"

export function FeedbackView() {
  return (
    <>
      <PageHeader
        title="Feedback"
        description="Rate every email Claude writes. Each ICP's latest good and bad emails are shown to Claude as examples when it writes the next ones, and you can have it improve the prompt from your feedback."
      />
      <div className="space-y-4 px-4 pb-10 md:px-8">
        <WorkspaceGate>{(wsId) => <Feedback key={wsId} wsId={wsId} />}</WorkspaceGate>
      </div>
    </>
  )
}

function Feedback({ wsId }: { wsId: string }) {
  const router = useRouter()
  const emails = useApi(() => fetchEmails(wsId), [wsId])
  const icps = useApi(() => fetchIcps(wsId), [wsId])
  const [icpId, setIcpId] = useState("all")
  const [filter, setFilter] = useState("unrated")
  const [openId, setOpenId] = useState<string | null>(null)
  const [improving, setImproving] = useState<ApiIcp | null>(null)
  const [busy, setBusy] = useState("")

  if (emails.error && !emails.data) return <BackendError message={emails.error} onRetry={emails.reload} />
  if (!emails.data) return <TableSkeleton rows={6} />

  const icpName = new Map((icps.data ?? []).map((i) => [i.id, i.name]))
  const forIcp = emails.data.filter((d) => icpId === "all" || d.lead.icpId === icpId)
  const visible = forIcp.filter(FILTERS.find((f) => f.value === filter)!.test)
  const open = emails.data.find((d) => d.id === openId) ?? null
  const activeIcp = icps.data?.find((i) => i.id === icpId)
  const ratedForIcp = forIcp.filter((d) => d.feedback).length

  const saveAsExample = async (d: EmailDraft) => {
    setBusy(`example-${d.id}`)
    try {
      await saveEmailAsExample(wsId, d.id)
      toast.success("Saved as an example email", {
        description: "It's on the Example emails page, linked to this lead's ICP.",
        action: { label: "Open", onClick: () => router.push("/examples") },
      })
    } catch (e) {
      toast.error("Couldn't save it", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy("")
    }
  }

  // One-click rating from the list keeps any tags and note already given.
  const quickRate = async (d: EmailDraft, rating: "good" | "bad") => {
    setBusy(d.id)
    try {
      const keep = d.feedback?.rating === rating
      await rateEmail(wsId, d.id, { rating, tags: keep ? d.feedback!.tags : [], note: keep ? d.feedback!.note : "" })
      emails.reload()
    } catch (e) {
      toast.error("Couldn't save the rating", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy("")
    }
  }

  if (emails.data.length === 0)
    return (
      <EmptyState
        icon={MessageSquareText}
        title="No emails to rate yet"
        description="Emails show up here once Claude writes them. Pick leads on the People page and choose Write emails."
        action={
          <Button asChild variant="outline">
            <Link href="/people">Go to People</Link>
          </Button>
        }
      />
    )

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={icpId} onValueChange={setIcpId}>
          <SelectTrigger aria-label="ICP" className="w-60!">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ICPs</SelectItem>
            {(icps.data ?? []).map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          {activeIcp && ratedForIcp < MIN_RATED && (
            <span className="text-xs text-muted-foreground">Rate {MIN_RATED - ratedForIcp} more to improve the prompt</span>
          )}
          <ManagerOnly><Button
            variant="outline"
            disabled={!activeIcp || ratedForIcp < MIN_RATED}
            title={!activeIcp ? "Pick an ICP first" : undefined}
            onClick={() => activeIcp && setImproving(activeIcp)}
          >
            <Sparkles /> Improve email prompt
          </Button></ManagerOnly>
        </div>
      </div>

      <div role="tablist" aria-label="Filter by rating" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              filter === f.value ? "border-data bg-data/10 font-medium" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {f.label} <span className="tabular-nums opacity-70">{forIcp.filter(f.test).length}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={MessageSquareText} title="Nothing here" description="Try another filter or ICP." />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {visible.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <button type="button" className="min-w-0 text-left" onClick={() => setOpenId(d.id)}>
                  <p className="truncate text-sm font-medium hover:underline">{d.subject}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    To {name(d)}
                    {d.lead.company ? ` at ${d.lead.company}` : ""}
                    {d.lead.icpId && icpId === "all" ? ` · ${icpName.get(d.lead.icpId) ?? "ICP"}` : ""} · {shortDate(d.createdAt)}
                  </p>
                </button>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label="Good"
                    aria-pressed={d.feedback?.rating === "good"}
                    disabled={busy === d.id}
                    className={cn(d.feedback?.rating === "good" && "border-positive bg-positive/10 text-positive")}
                    onClick={() => void quickRate(d, "good")}
                  >
                    <ThumbsUp />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label="Bad"
                    aria-pressed={d.feedback?.rating === "bad"}
                    disabled={busy === d.id}
                    className={cn(d.feedback?.rating === "bad" && "border-negative bg-negative/10 text-negative")}
                    onClick={() => void quickRate(d, "bad")}
                  >
                    <ThumbsDown />
                  </Button>
                </div>
              </div>
              <p className="line-clamp-4 text-[13px] leading-relaxed whitespace-pre-wrap">{d.body}</p>
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                {d.hook ? <Pill tone="info">Hook from a post</Pill> : <Pill>No hook</Pill>}
                {d.feedback?.tags.map((t) => (
                  <Pill key={t} tone={d.feedback!.rating === "good" ? "positive" : "negative"}>
                    {TAG_LABEL[t]}
                  </Pill>
                ))}
                {d.feedback?.note && <span className="truncate text-xs text-muted-foreground">“{d.feedback.note}”</span>}
                <button type="button" className="ml-auto text-xs text-data hover:underline" onClick={() => setOpenId(d.id)}>
                  {d.feedback ? "Edit feedback" : "Add feedback"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <Sheet open onOpenChange={(o) => !o && setOpenId(null)}>
          <SheetContent className="w-full! gap-0 overflow-y-auto sm:max-w-xl!">
            <SheetHeader className="px-5 pt-5 pb-4">
              <SheetTitle className="text-lg">{open.subject}</SheetTitle>
              <SheetDescription>
                To {name(open)}
                {open.lead.title ? `, ${open.lead.title}` : ""}
                {open.lead.company ? ` at ${open.lead.company}` : ""}
                {open.examplesUsed ? ` · written with ${open.examplesUsed} rated examples` : ""}
              </SheetDescription>
            </SheetHeader>
            <section className="space-y-2 border-t border-rule px-5 py-4">
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{open.body}</p>
              {open.edited && <p className="text-xs text-muted-foreground">This is the edited version; Claude&apos;s original is kept.</p>}
            </section>
            {open.hook && (
              <section className="space-y-1 border-t border-rule px-5 py-4 text-[13px]">
                <p>
                  <span className="font-medium">Hook:</span> {open.hook}
                </p>
                {open.chosenPost && (
                  <a href={open.chosenPost.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                    From {open.chosenPost.whose === "person" ? "their" : "their company's"} {open.chosenPost.source} post{" "}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </section>
            )}
            <section className="space-y-2 border-t border-rule px-5 py-4">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Your feedback</h3>
              <FeedbackControl key={open.id + (open.feedback?.updatedAt ?? "")} workspaceId={wsId} draft={open} onSaved={() => emails.reload()} />
            </section>
            <section className="space-y-2 border-t border-rule px-5 py-4">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Example emails</h3>
              <p className="text-xs text-muted-foreground">
                Copy this email{open.edited ? ", with your edits," : ""} into the example library for its ICP. Claude writes like it from
                then on.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={!open.lead.icpId || busy === `example-${open.id}`}
                title={!open.lead.icpId ? "This lead has no ICP to link the example to" : undefined}
                onClick={() => void saveAsExample(open)}
              >
                <Mail /> {busy === `example-${open.id}` ? "Saving…" : "Save as example"}
              </Button>
            </section>
          </SheetContent>
        </Sheet>
      )}

      {improving && <ImproveDialog wsId={wsId} icp={improving} onClose={() => setImproving(null)} />}
    </>
  )
}

/** Claude's suggested rewrite of the ICP's email prompt, from the feedback. Saved only if you choose to. */
function ImproveDialog({ wsId, icp, onClose }: { wsId: string; icp: ApiIcp; onClose: () => void }) {
  const { versions, templates, saveVersion } = useStore()
  const [suggestion, setSuggestion] = useState<PromptSuggestion | null>(null)
  const [state, setState] = useState<"idle" | "asking" | "saving">("idle")
  const [failure, setFailure] = useState("")

  const ask = async () => {
    setState("asking")
    setFailure("")
    try {
      setSuggestion(await suggestEmailPrompt(wsId, icp.id))
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Claude couldn't suggest a prompt.")
    } finally {
      setState("idle")
    }
  }

  const save = async () => {
    if (!suggestion) return
    const template = templates.find((t) => t.id === suggestion.promptId)
    const current = versions.find((v) => v.id === template?.currentVersionId)
    if (!current) {
      toast.error("Reload the page and try again: the prompt isn't loaded")
      return
    }
    setState("saving")
    try {
      const v = await saveVersion(
        suggestion.promptId,
        { systemPrompt: suggestion.systemPrompt, userPrompt: suggestion.userPrompt, model: current.model, temperature: current.temperature, maxTokens: current.maxTokens, maxPosts: current.maxPosts },
        `Improved from feedback on ${suggestion.examples} rated emails: ${suggestion.summary}`.slice(0, 500),
      )
      toast.success(`Saved ${suggestion.promptName} v${v.version}`)
      onClose()
    } catch (e) {
      toast.error("Couldn't save it", { description: e instanceof Error ? e.message : undefined })
      setState("idle")
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && state === "idle" && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl!">
        <DialogHeader>
          <DialogTitle>Improve the email prompt for {icp.name}</DialogTitle>
          <DialogDescription>
            Claude (Sonnet 5.5) reads the prompt this ICP uses and your latest ratings, then suggests a revised prompt. Nothing changes
            until you save it.
          </DialogDescription>
        </DialogHeader>

        {failure && <p className="text-sm text-destructive">{failure}</p>}

        {suggestion ? (
          <div className="space-y-4">
            <div className="space-y-1 text-sm">
              <p className="font-medium">{suggestion.summary}</p>
              {suggestion.changes.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
                  {suggestion.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground tabular-nums">
                From {suggestion.examples} rated emails, based on {suggestion.promptName} v{suggestion.basedOnVersion} · Claude cost{" "}
                {formatUsd(suggestion.costUsd)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Suggested system prompt</p>
              <pre className="max-h-40 overflow-y-auto rounded-md bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap">{suggestion.systemPrompt}</pre>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Suggested prompt</p>
              <pre className="max-h-72 overflow-y-auto rounded-md bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap">{suggestion.userPrompt}</pre>
            </div>
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[13px]">
              Saving adds v{suggestion.basedOnVersion + 1} to {suggestion.promptName}, and it&apos;s used from then on by
              {suggestion.isDefault ? " every ICP set to “Use default”" : ""}
              {suggestion.isDefault && suggestion.chosenByIcps ? " and" : ""}
              {suggestion.chosenByIcps ? ` ${suggestion.chosenByIcps} ICP${suggestion.chosenByIcps === 1 ? "" : "s"} that chose it` : ""}
              {!suggestion.isDefault && !suggestion.chosenByIcps ? " the ICPs that use it" : ""}. To change only {icp.name}, open the
              prompt, duplicate it and pick the copy on the ICP&apos;s Prompts tab.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {state === "asking" ? "Claude is reading your feedback… this can take a minute." : "Uses a few cents of Claude credit."}
          </p>
        )}

        <DialogFooter>
          {suggestion && (
            <Button variant="ghost" asChild>
              <Link href={`/prompts/${suggestion.promptId}`}>Open the prompt</Link>
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={state !== "idle"}>
            {suggestion ? "Discard" : "Cancel"}
          </Button>
          {suggestion ? (
            <Button onClick={() => void save()} disabled={state !== "idle"}>
              {state === "saving" ? "Saving…" : `Save as v${suggestion.basedOnVersion + 1}`}
            </Button>
          ) : (
            <Button onClick={() => void ask()} disabled={state !== "idle"}>
              <Sparkles /> {state === "asking" ? "Asking Claude…" : "Suggest a better prompt"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
