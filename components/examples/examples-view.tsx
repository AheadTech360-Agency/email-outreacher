"use client"

import { useRef, useState } from "react"
import { Mail, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { BackendError, WorkspaceGate } from "@/components/companies/backend-state"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { ManagerOnly } from "@/components/manager-only"
import { PageHeader } from "@/components/page-header"
import { Pill } from "@/components/status"
import { TableSkeleton } from "@/components/table-skeleton"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  type ApiIcp,
  type ExampleEmail,
  type ExampleEmailFields,
  createExample,
  deleteExample,
  fetchExamples,
  fetchIcps,
  updateExample,
  useApi,
} from "@/lib/api"
import { shortDate } from "@/lib/format"

const EMPTY: ExampleEmailFields = { subject: "", body: "", note: "", allIcps: false, icpIds: [] }

export function ExamplesView() {
  return (
    <>
      <PageHeader
        title="Example emails"
        description="Emails in the voice you want, for each ICP. Claude writes like them and scores drafts against them as {{examples.samples}}."
      />
      <div className="space-y-4 px-4 pb-10 md:px-8">
        <WorkspaceGate>{(wsId) => <Examples key={wsId} wsId={wsId} />}</WorkspaceGate>
      </div>
    </>
  )
}

function Examples({ wsId }: { wsId: string }) {
  const examples = useApi(() => fetchExamples(wsId), [wsId])
  const icps = useApi(() => fetchIcps(wsId), [wsId])
  const [icpFilter, setIcpFilter] = useState("all")
  const [editing, setEditing] = useState<ExampleEmail | "new" | null>(null)

  if (examples.error && !examples.data) return <BackendError message={examples.error} onRetry={examples.reload} />
  if (!examples.data) return <TableSkeleton rows={4} />

  const icpName = new Map((icps.data ?? []).map((i) => [i.id, i.name]))
  const visible = examples.data.filter((e) => icpFilter === "all" || e.allIcps || e.icpIds.includes(icpFilter))

  return (
    <>
      {examples.data.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No example emails yet"
          description="Add emails written the way you want yours to sound, or save good ones from the Feedback page."
          action={
            <ManagerOnly><Button onClick={() => setEditing("new")}>
              <Plus /> Add an example
            </Button></ManagerOnly>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={icpFilter} onValueChange={setIcpFilter}>
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
            <ManagerOnly><Button className="ml-auto" onClick={() => setEditing("new")}>
              <Plus /> Add an example
            </Button></ManagerOnly>
          </div>
          {visible.length === 0 ? (
            <EmptyState icon={Mail} title="No examples for this ICP" description="Add one, or link an existing example to it." />
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {visible.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(e)}
                    className="flex h-full w-full flex-col gap-2 rounded-lg border p-4 text-left outline-none hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <p className="truncate text-sm font-medium">{e.subject || "No subject"}</p>
                    <p className="line-clamp-4 text-[13px] leading-relaxed whitespace-pre-wrap">{e.body}</p>
                    {e.note && <p className="line-clamp-2 text-xs text-muted-foreground">Why it&apos;s good: {e.note}</p>}
                    <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                      {e.allIcps ? (
                        <Pill tone="info">All ICPs</Pill>
                      ) : (
                        e.icpIds.map((id) => <Pill key={id}>{icpName.get(id) ?? "ICP"}</Pill>)
                      )}
                      {e.source === "generated" && <Pill>Saved from Feedback</Pill>}
                      <span className="ml-auto text-xs text-muted-foreground">{shortDate(e.updatedAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {editing && (
        <ExampleSheet
          key={editing === "new" ? "new" : editing.id}
          wsId={wsId}
          icps={icps.data ?? []}
          example={editing === "new" ? null : editing}
          defaultIcp={icpFilter === "all" ? null : icpFilter}
          onClose={() => setEditing(null)}
          onSaved={examples.reload}
        />
      )}
    </>
  )
}

function ExampleSheet({
  wsId,
  icps,
  example,
  defaultIcp,
  onClose,
  onSaved,
}: {
  wsId: string
  icps: ApiIcp[]
  example: ExampleEmail | null
  defaultIcp: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<ExampleEmailFields>(() =>
    example
      ? { subject: example.subject, body: example.body, note: example.note, allIcps: example.allIcps, icpIds: example.icpIds }
      : { ...EMPTY, icpIds: defaultIcp ? [defaultIcp] : [] },
  )
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const subjectRef = useRef<HTMLInputElement>(null)
  const errors = {
    body: !draft.body.trim() ? "Write or paste the email" : "",
    icps: !draft.allIcps && draft.icpIds.length === 0 ? "Pick the ICPs it's for, or all ICPs" : "",
  }
  const shown = touched ? errors : { body: "", icps: "" }

  /** Save; with `addAnother`, keep the panel open with an empty form (same ICPs) for the next example. */
  const save = async (addAnother = false) => {
    setTouched(true)
    if (errors.body || errors.icps) return
    setBusy(true)
    try {
      if (example) await updateExample(wsId, example.id, draft)
      else await createExample(wsId, draft)
      toast.success(example ? "Example saved" : "Example added")
      onSaved()
      if (addAnother) {
        setDraft((d) => ({ ...EMPTY, allIcps: d.allIcps, icpIds: d.icpIds }))
        setTouched(false)
        subjectRef.current?.focus()
      } else {
        onClose()
      }
    } catch (e) {
      toast.error("Couldn't save it", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!example) return
    try {
      await deleteExample(wsId, example.id)
      toast.success("Example deleted")
      onSaved()
      onClose()
    } catch (e) {
      toast.error("Couldn't delete it", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setConfirmDelete(false)
    }
  }

  const toggleIcp = (id: string, on: boolean) =>
    setDraft((d) => ({ ...d, icpIds: on ? [...d.icpIds, id] : d.icpIds.filter((x) => x !== id) }))

  return (
    <Sheet open onOpenChange={(o) => !o && !busy && onClose()}>
      <SheetContent className="w-full! gap-0 overflow-y-auto sm:max-w-lg!">
        <SheetHeader className="px-5 pt-5 pb-4">
          <SheetTitle className="text-lg">{example ? "Edit example email" : "New example email"}</SheetTitle>
          <SheetDescription>
            Claude matches its length, tone and structure, never its facts.
            {example?.source === "generated" ? " Saved from a generated email." : ""}
          </SheetDescription>
        </SheetHeader>
        <form
          id="example-form"
          className="space-y-4 border-t border-rule px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="example-subject">Subject</Label>
            <Input
              id="example-subject"
              ref={subjectRef}
              value={draft.subject}
              onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="example-body">Email</Label>
            <Textarea
              id="example-body"
              rows={10}
              placeholder={"Hi Sam,\n\n…"}
              value={draft.body}
              aria-invalid={!!shown.body || undefined}
              aria-describedby="example-body-hint"
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
            />
            <p id="example-body-hint" className={shown.body ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {shown.body || "From the greeting to the closing line."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="example-note">Why it&apos;s a good example</Label>
            <Textarea
              id="example-note"
              rows={2}
              placeholder="Opens on their post, one clear ask, under 100 words"
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">Optional. Shown to Claude next to the example.</p>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Used for</legend>
            <Label className="flex cursor-pointer items-center gap-2 text-sm font-normal">
              <Switch checked={draft.allIcps} onCheckedChange={(v) => setDraft((d) => ({ ...d, allIcps: v }))} />
              All ICPs
            </Label>
            {!draft.allIcps && (
              <div className="grid gap-2 pt-1 sm:grid-cols-2">
                {icps.map((i) => (
                  <Label key={i.id} className="flex cursor-pointer items-center gap-2 text-sm font-normal">
                    <Checkbox checked={draft.icpIds.includes(i.id)} onCheckedChange={(v) => toggleIcp(i.id, v === true)} />
                    {i.name}
                  </Label>
                ))}
              </div>
            )}
            {shown.icps && <p className="text-xs text-destructive">{shown.icps}</p>}
          </fieldset>
        </form>
        <SheetFooter className="flex-row flex-wrap justify-between gap-2 border-t border-rule px-5 py-4">
          {example ? (
            <Button variant="ghost" className="text-destructive" disabled={busy} onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              {example ? "Cancel" : "Done"}
            </Button>
            {!example && (
              <Button variant="outline" disabled={busy} onClick={() => void save(true)}>
                Save and add another
              </Button>
            )}
            <Button type="submit" form="example-form" disabled={busy}>
              {busy ? "Saving…" : example ? "Save" : "Add example"}
            </Button>
          </div>
        </SheetFooter>
        {example && (
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            destructive
            title="Delete this example?"
            description="Claude stops seeing it. This can't be undone."
            confirmLabel="Delete example"
            onConfirm={() => void remove()}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
