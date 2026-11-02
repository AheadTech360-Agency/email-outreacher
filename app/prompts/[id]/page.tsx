"use client"

import Link from "next/link"
import { notFound, useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ChevronLeft, Copy, Save, Star } from "lucide-react"
import { toast } from "sonner"
import { ManagerOnly } from "@/components/manager-only"
import { PageHeader } from "@/components/page-header"
import { OutputSchemaView } from "@/components/prompt/output-schema"
import { PromptBody } from "@/components/prompt/prompt-body"
import { VersionHistory } from "@/components/prompt/version-history"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { KIND_LABEL } from "@/lib/prompt-starters"
import { useStore, type VersionDraft } from "@/lib/store"
import type { PromptTemplate, PromptVersion } from "@/lib/types"

export default function PromptEditorPage() {
  const { id } = useParams<{ id: string }>()
  const { templates, versions, promptsStatus, promptsError, reloadPrompts } = useStore()
  const template = templates.find((t) => t.id === id)
  const version = versions.find((v) => v.id === template?.currentVersionId)
  // Lives outside Editor so the open tab survives the remount after saving or restoring a version.
  const [tab, setTab] = useState("history")

  // Prompts load from the backend; only call it missing once they have.
  if (promptsStatus === "loading")
    return (
      <div className="space-y-4 px-4 pt-7 md:px-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  if (promptsStatus === "error")
    return (
      <p className="px-4 pt-7 text-sm text-destructive md:px-8">
        Couldn&apos;t load prompts: {promptsError}{" "}
        <button type="button" className="underline" onClick={reloadPrompts}>
          Try again
        </button>
      </p>
    )
  if (!template || !version) notFound()
  return <Editor key={template.currentVersionId} template={template} version={version} tab={tab} onTabChange={setTab} />
}

const toDraft = (v: PromptVersion): VersionDraft => ({
  systemPrompt: v.systemPrompt,
  userPrompt: v.userPrompt,
  model: v.model,
  temperature: v.temperature,
  maxTokens: v.maxTokens,
  maxPosts: v.maxPosts,
})

function Editor({
  template,
  version,
  tab,
  onTabChange,
}: {
  template: PromptTemplate
  version: PromptVersion
  tab: string
  onTabChange: (tab: string) => void
}) {
  const { saveVersion, duplicateTemplate, setDefaultTemplate } = useStore()
  const router = useRouter()
  const [draft, setDraft] = useState<VersionDraft>(() => toDraft(version))
  const [saveOpen, setSaveOpen] = useState(false)
  const [note, setNote] = useState("")

  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(version))

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const save = async () => {
    try {
      const v = await saveVersion(template.id, draft, note.trim())
      setSaveOpen(false)
      toast.success(`Saved ${template.name} v${v.version}`)
    } catch (e) {
      toast.error("Couldn't save it", { description: e instanceof Error ? e.message : undefined })
    }
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-1">
            <Link href="/prompts" className="text-muted-foreground hover:text-foreground" aria-label="Back to prompts">
              <ChevronLeft className="size-4" />
            </Link>
            {template.name}
          </span>
        }
        description={`${KIND_LABEL[template.kind]} prompt · editing from v${version.version}`}
        actions={
          <>
            {dirty && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                Unsaved
              </Badge>
            )}
            {template.isDefault ? (
              <Badge variant="secondary">
                <Star /> Default
              </Badge>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setDefaultTemplate(template.id).then(
                    () => toast.success(`${template.name} is now the default ${KIND_LABEL[template.kind].toLowerCase()} prompt`),
                    (e: unknown) => toast.error("Couldn't change the default", { description: e instanceof Error ? e.message : undefined }),
                  )
                }
              >
                <Star /> Set as default
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                duplicateTemplate(template.id).then(
                  (copy) => {
                    toast.success(`Created ${copy.name}`)
                    router.push(`/prompts/${copy.id}`)
                  },
                  (e: unknown) => toast.error("Couldn't duplicate it", { description: e instanceof Error ? e.message : undefined }),
                )
              }
            >
              <Copy /> Duplicate
            </Button>
            <ManagerOnly><Button size="sm" disabled={!dirty} onClick={() => setSaveOpen(true)}>
              <Save /> Save as new version
            </Button></ManagerOnly>
          </>
        }
      />

      <div className="space-y-6 px-4 pb-10 md:px-8">
        <PromptBody kind={template.kind} draft={draft} setDraft={setDraft} />

        <Tabs value={tab} onValueChange={onTabChange}>
          <TabsList>
            <TabsTrigger value="history">Version history</TabsTrigger>
            <TabsTrigger value="output">Output schema</TabsTrigger>
          </TabsList>
          <TabsContent value="history" className="pt-2">
            <VersionHistory template={template} onRestored={() => undefined} />
          </TabsContent>
          <TabsContent value="output" className="pt-2">
            <OutputSchemaView kind={template.kind} />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as v{version.version + 1}</DialogTitle>
            <DialogDescription>
              v{version.version} stays in history. ICPs using this template pick up the new version on their next run.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="note">Note (optional)</Label>
              <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed and why" autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save version</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
