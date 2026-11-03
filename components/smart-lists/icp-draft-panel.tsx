"use client"

import Link from "next/link"
import { useState } from "react"
import { Sparkles } from "lucide-react"
import { toast } from "sonner"
import { ManagerOnly } from "@/components/manager-only"
import { TagInput } from "@/components/tag-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { type SmartList, type SmartListIcpDraft, createIcpFromList, draftSmartListIcp } from "@/lib/api"

const errorText = (e: unknown) => (e instanceof Error ? e.message : undefined)

const EMPTY_DRAFT: SmartListIcpDraft = { name: "", industry: "", description: "", searchTerms: [], anyOf: [], titles: [], places: [] }

/** A company list's base ICP: draft it with Claude, edit it, create it. */
export function IcpDraftPanel({ wsId, list, onChanged }: { wsId: string; list: SmartList; onChanged: () => void }) {
  const [draft, setDraft] = useState<SmartListIcpDraft | null>(list.icpDraft)
  const [busy, setBusy] = useState<"" | "draft" | "create">("")
  const set = <K extends keyof SmartListIcpDraft>(k: K, v: SmartListIcpDraft[K]) => setDraft((x) => ({ ...(x ?? EMPTY_DRAFT), [k]: v }))

  if (list.leadIntelIcpId)
    return (
      <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
        Its ICP is created.{" "}
        <Link href="/icps" className="underline">
          Open ICPs
        </Link>{" "}
        to add a product and run it.
      </p>
    )

  const makeDraft = async () => {
    setBusy("draft")
    try {
      const r = await draftSmartListIcp(wsId, list.id)
      setDraft(r.icpDraft)
      onChanged()
    } catch (e) {
      toast.error("Couldn't draft it", { description: errorText(e) })
    } finally {
      setBusy("")
    }
  }
  const create = async () => {
    if (!draft) return
    setBusy("create")
    try {
      await createIcpFromList(wsId, list.id, draft)
      toast.success(`ICP "${draft.name || list.name}" created`, { description: "Add a product to it on the ICPs page before running it." })
      onChanged()
    } catch (e) {
      toast.error("Couldn't create it", { description: errorText(e) })
    } finally {
      setBusy("")
    }
  }

  if (!draft)
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span>Turn this list into a base ICP: Claude drafts it from the companies in it, you edit it, then create it.</span>
        <ManagerOnly>
          <Button size="sm" variant="outline" disabled={!!busy || !list.count} onClick={() => void makeDraft()}>
            <Sparkles /> {busy === "draft" ? "Drafting…" : "Draft an ICP"}
          </Button>
        </ManagerOnly>
      </div>
    )

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Base ICP draft</h3>
        <ManagerOnly>
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void makeDraft()}>
            {busy === "draft" ? "Drafting…" : "Draft again"}
          </Button>
        </ManagerOnly>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="d-name">Name</Label>
          <Input id="d-name" value={draft.name} placeholder={list.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-industry">Industry</Label>
          <Input id="d-industry" value={draft.industry} placeholder={list.name} onChange={(e) => set("industry", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="d-description">Who they are</Label>
        <Textarea id="d-description" rows={2} value={draft.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="d-terms">Google Maps search terms</Label>
          <TagInput id="d-terms" value={draft.searchTerms} onChange={(v) => set("searchTerms", v)} placeholder="screen printing" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-words">Words that identify them</Label>
          <TagInput id="d-words" value={draft.anyOf} onChange={(v) => set("anyOf", v)} placeholder="custom apparel" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-titles">Job titles to reach</Label>
          <TagInput id="d-titles" value={draft.titles} onChange={(v) => set("titles", v)} placeholder="Owner" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-places">Places</Label>
          <TagInput places id="d-places" value={draft.places} onChange={(v) => set("places", v)} placeholder="Austin, TX" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Empty fields stay empty. You can fill them in later on the ICPs page.</p>
      <ManagerOnly>
        <Button disabled={!!busy} onClick={() => void create()}>
          {busy === "create" ? "Creating…" : "Create ICP"}
        </Button>
      </ManagerOnly>
    </div>
  )
}
