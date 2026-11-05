"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Check, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { PageHeader } from "@/components/page-header"
import { OutputSchemaView } from "@/components/prompt/output-schema"
import { PromptBody } from "@/components/prompt/prompt-body"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { KIND_LABEL, PROMPT_STARTERS } from "@/lib/prompt-starters"
import { FOLLOWUP_KINDS, ICP_PROMPT_FIELD, isIcpPromptKind, resolveScoringTemplate, resolveTemplate } from "@/lib/selectors"
import { useStore, type VersionDraft } from "@/lib/store"
import type { PromptKind, PromptTemplate } from "@/lib/types"

const STARTER = "__starter__"

type Source = { kind: PromptKind; from: string }

/** New prompt page: basics, the prompt itself, where it is used, and a test run before creating. */
export function NewPromptForm({ initialKind }: { initialKind: PromptKind }) {
  const { templates, versions, icps, settings, createTemplate, updateIcp, saveSettings } = useStore()
  const router = useRouter()

  const loadSource = ({ kind, from }: Source): VersionDraft => {
    const tpl = from !== STARTER ? templates.find((t) => t.id === from) : undefined
    const v = tpl && versions.find((x) => x.id === tpl.currentVersionId)
    if (v) return { systemPrompt: v.systemPrompt, userPrompt: v.userPrompt, model: v.model, temperature: v.temperature, maxTokens: v.maxTokens, maxPosts: v.maxPosts }
    return { ...PROMPT_STARTERS[kind], model: settings.defaultModel }
  }

  const [source, setSource] = useState<Source>({ kind: initialKind, from: STARTER })
  const [draft, setDraft] = useState<VersionDraft>(() => loadSource({ kind: initialKind, from: STARTER }))
  const [name, setName] = useState("")
  const [note, setNote] = useState("")
  const [icpIds, setIcpIds] = useState<Set<string>>(new Set())
  const [makeDefault, setMakeDefault] = useState(false)
  const [useForScoring, setUseForScoring] = useState(false)
  const [touched, setTouched] = useState(false)
  const [pendingSource, setPendingSource] = useState<Source | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [done, setDone] = useState(false)

  const kind = source.kind
  const sourceTemplate = templates.find((t) => t.id === source.from)
  const edited = JSON.stringify(draft) !== JSON.stringify(loadSource(source))
  const dirty = !done && (!!name.trim() || edited || icpIds.size > 0 || makeDefault || useForScoring)

  const nameTaken = templates.some((t) => t.name.trim().toLowerCase() === name.trim().toLowerCase())
  const errors = {
    name: !name.trim() ? "Give the prompt a name." : nameTaken ? "A prompt with this name already exists." : "",
    user: draft.userPrompt.trim() ? "" : "The user prompt can't be empty.",
  }

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  /** Switching type or starting point replaces the prompt text, so ask first if it was edited. */
  const changeSource = (next: Source) => {
    if (edited) setPendingSource(next)
    else applySource(next)
  }
  const applySource = (next: Source) => {
    setSource(next)
    setDraft(loadSource(next))
    if (next.kind !== kind) {
      setIcpIds(new Set())
      setMakeDefault(false)
      setUseForScoring(false)
    }
  }

  const create = async () => {
    setTouched(true)
    if (errors.name || errors.user) {
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    const sourceVersion = sourceTemplate && versions.find((v) => v.id === sourceTemplate.currentVersionId)
    let tpl: PromptTemplate
    try {
      tpl = await createTemplate({
        name,
        kind,
        draft,
        isDefault: makeDefault,
        note:
          note.trim() ||
          (sourceTemplate && sourceVersion ? `Created from a copy of ${sourceTemplate.name} v${sourceVersion.version}` : "Created from the starter prompt"),
      })
    } catch (e) {
      toast.error("Couldn't create it", { description: e instanceof Error ? e.message : undefined })
      return
    }
    if (isIcpPromptKind(kind)) {
      const field = ICP_PROMPT_FIELD[kind]
      const failed = (await Promise.allSettled([...icpIds].map((id) => updateIcp(id, { [field]: tpl.id })))).filter(
        (r) => r.status === "rejected",
      ).length
      if (failed) toast.error(`Created, but ${failed} ICP${failed === 1 ? "" : "s"} couldn't be switched to it`)
    }
    if (kind === "score" && useForScoring) {
      await saveSettings({ ...settings, scoring: { ...settings.scoring, promptId: tpl.id } }).catch((e: unknown) =>
        toast.error("Created, but it couldn't be made the scoring prompt", { description: e instanceof Error ? e.message : undefined }),
      )
    }
    setDone(true)
    const uses = [
      icpIds.size && `used by ${icpIds.size} ICP${icpIds.size === 1 ? "" : "s"}`,
      useForScoring && "now the scoring prompt",
      makeDefault && "now the default",
    ].filter(Boolean)
    toast.success(`Created ${tpl.name}`, { description: uses.length ? `It's ${uses.join(", ")}.` : "Not used anywhere yet." })
    router.push(`/prompts/${tpl.id}`)
  }

  const currentDefault = templates.find((t) => t.kind === kind && t.isDefault)
  const currentScoring = resolveScoringTemplate(templates, settings.scoring)

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 px-4 pt-5 text-[13px] text-muted-foreground md:px-8 md:pt-6">
        <Link href="/prompts" className="hover:text-foreground">
          Prompts
        </Link>
        <ChevronRight className="size-3.5" />
        <span>New prompt</span>
      </nav>
      <div className="-mt-4 md:-mt-5">
        <PageHeader
          title={name.trim() || "New prompt"}
          description={`${KIND_LABEL[kind]} prompt. Write it, try it on a real lead, then create it as v1.`}
          actions={
            <>
              <Button variant="ghost" onClick={() => (dirty ? setConfirmLeave(true) : router.push("/prompts"))}>
                Cancel
              </Button>
              <Button onClick={create}>
                <Check /> Create prompt
              </Button>
            </>
          }
        />
      </div>

      <div className="space-y-6 px-4 pb-10 md:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Basics</CardTitle>
            <CardDescription>The type decides which variables are available and what the prompt must return.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="space-y-1.5">
              <Label htmlFor="prompt-name">Name</Label>
              <Input
                id="prompt-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Founder-to-founder email"
                aria-invalid={(touched && !!errors.name) || undefined}
                aria-describedby="prompt-name-note"
                autoFocus
              />
              <p id="prompt-name-note" className={touched && errors.name ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                {(touched && errors.name) || "Shown in prompt pickers across the app."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prompt-kind">Type</Label>
              <Select value={kind} onValueChange={(v) => changeSource({ kind: v as PromptKind, from: STARTER })}>
                <SelectTrigger id="prompt-kind" className="w-full!">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as PromptKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prompt-from">Start from</Label>
              <Select value={source.from} onValueChange={(from) => changeSource({ kind, from })}>
                <SelectTrigger id="prompt-from" className="w-full!">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={STARTER}>A starter {KIND_LABEL[kind].toLowerCase()} prompt</SelectItem>
                  {templates
                    .filter((t) => t.kind === kind)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        A copy of {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Fills in the prompt below. Edit anything.</p>
            </div>
          </CardContent>
        </Card>

        <section className="space-y-3" aria-label="Prompt">
          <h2 className="text-[15px] font-semibold">Prompt</h2>
          <PromptBody kind={kind} draft={draft} setDraft={setDraft} userError={touched ? errors.user : ""} />
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Where it&apos;s used</CardTitle>
              <CardDescription>
                {kind === "score"
                  ? "Scoring prompts apply to every ICP from Settings."
                  : FOLLOWUP_KINDS.includes(kind)
                    ? "Every ICP's follow-ups are written with the default follow-up prompt. Make this one the default to use it."
                    : "Pick the ICPs that should switch to this prompt. You can change this later on each ICP's Prompts tab."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {kind === "score" ? (
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Label htmlFor="use-scoring">Use it as the scoring prompt</Label>
                    <p className="text-xs text-muted-foreground">Now: {currentScoring?.name}</p>
                  </div>
                  <Switch id="use-scoring" checked={useForScoring} onCheckedChange={setUseForScoring} />
                </div>
              ) : !isIcpPromptKind(kind) ? null : (
                <ul className="space-y-2">
                  {icps.map((icp) => {
                    const now = resolveTemplate(templates, icp, kind)
                    return (
                      <li key={icp.id} className="flex items-center gap-3">
                        <Checkbox
                          id={`use-${icp.id}`}
                          checked={icpIds.has(icp.id)}
                          onCheckedChange={(v) =>
                            setIcpIds((s) => {
                              const next = new Set(s)
                              if (v === true) next.add(icp.id)
                              else next.delete(icp.id)
                              return next
                            })
                          }
                        />
                        <Label htmlFor={`use-${icp.id}`} className="flex min-w-0 flex-1 items-baseline justify-between gap-3 font-normal">
                          <span className="truncate">{icp.name}</span>
                          <span className="flex-none text-xs text-muted-foreground">now: {now?.name}</span>
                        </Label>
                      </li>
                    )
                  })}
                </ul>
              )}
              <div className="flex items-start justify-between gap-4 border-t pt-4">
                <div>
                  <Label htmlFor="make-default">Make it the default {KIND_LABEL[kind].toLowerCase()} prompt</Label>
                  <p className="text-xs text-muted-foreground">
                    {kind === "analysis" ? "Used when Smart analysis is refreshed in this workspace." : kind === "product" ? "Used by AI suggestions on Products for this workspace." : kind === "score"
                      ? `Used when Settings is on "Use default". Now: ${currentDefault?.name}.`
                      : `ICPs set to "Use default" switch to it. Now: ${currentDefault?.name}.`}
                  </p>
                </div>
                <Switch id="make-default" checked={makeDefault} onCheckedChange={setMakeDefault} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Version note</CardTitle>
              <CardDescription>Optional. Shown in version history next to v1.</CardDescription>
            </CardHeader>
            <CardContent>
              <Label htmlFor="prompt-note" className="sr-only">
                Version note
              </Label>
              <Input
                id="prompt-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={sourceTemplate ? `Created from a copy of ${sourceTemplate.name}` : "Why this prompt exists"}
              />
            </CardContent>
          </Card>
        </div>

        <section className="space-y-3" aria-label="Output schema">
          <div>
            <h2 className="text-[15px] font-semibold">Output schema</h2>
            <p className="text-sm text-muted-foreground">The JSON shape this kind of prompt always answers in.</p>
          </div>
          <OutputSchemaView kind={kind} />
        </section>

        <div className="flex justify-end gap-2 border-t pt-5">
          <Button variant="ghost" onClick={() => (dirty ? setConfirmLeave(true) : router.push("/prompts"))}>
            Cancel
          </Button>
          <Button onClick={create}>
            <Check /> Create prompt
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingSource}
        onOpenChange={(o) => !o && setPendingSource(null)}
        title="Replace your edits?"
        description="Changing the type or starting point replaces the prompt text you've written."
        confirmLabel="Replace prompt"
        onConfirm={() => {
          if (pendingSource) applySource(pendingSource)
          setPendingSource(null)
        }}
      />
      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        destructive
        title="Discard this prompt?"
        description="Nothing has been created yet. Everything on this page will be lost."
        confirmLabel="Discard prompt"
        onConfirm={() => {
          setDone(true)
          router.push("/prompts")
        }}
      />
    </>
  )
}
