"use client"

import { useEffect, useState } from "react"
import { Pencil } from "lucide-react"
import { toast } from "sonner"
import { EditIcpDefinition } from "@/components/edit-icp-definition"
import { BasicsFields, LeadIntelRule, MessagingFields, ProductField, AnalysisSourcesFields, TargetingFields, VerificationSourcesFields, toDraft, type IcpDraft } from "@/components/icp-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useIcpParam } from "@/hooks/use-icp"
import { useStore } from "@/lib/store"
import type { ICP } from "@/lib/types"

export default function DefinitionPage() {
  const icp = useIcpParam()
  if (!icp) return null
  return <DefinitionForm key={icp.id} icp={icp} />
}

function DefinitionForm({ icp }: { icp: ICP }) {
  const { updateIcp, settings } = useStore()
  // Shared with a Prospector to use only: they read it, and nothing here can be changed.
  const readOnly = icp.canEdit === false
  const [draft, setDraft] = useState<IcpDraft>(() => toDraft(icp))
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(icp))

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const set = <K extends keyof IcpDraft>(key: K, value: IcpDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const save = async () => {
    setSaving(true)
    try {
      await updateIcp(icp.id, draft)
      toast.success("Outreach settings saved")
    } catch (e) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-4 -mt-6 flex items-center gap-2 border-b bg-background px-4 py-2.5 md:-mx-8 md:px-8">
        {readOnly ? (
          <span className="text-xs text-muted-foreground">Shared with you to use. Ask an admin if you need to change it.</span>
        ) : dirty ? (
          <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
            Unsaved changes
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">All changes saved</span>
        )}
        <div className={readOnly ? "hidden" : "ml-auto flex gap-2"}>
          <Button variant="outline" disabled={!dirty || saving} onClick={() => setDraft(toDraft(icp))}>
            Discard
          </Button>
          <Button disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      <fieldset disabled={readOnly} className="grid min-w-0 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <CardTitle>Lead Intel definition</CardTitle>
                  <CardDescription>
                    Who this ICP is: the words Google Maps and Apollo search with, where, and the rule research checks
                    companies against. Stored in Lead Intel&apos;s ICP table, which this app keeps using.
                  </CardDescription>
                </div>
                {!readOnly && (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    <Pencil /> Edit
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <LeadIntelRule icp={icp} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Who to reach</CardTitle>
              <CardDescription>Outreach settings for this workspace. Saved here, never in Lead Intel.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <TargetingFields draft={draft} set={set} />
              <BasicsFields draft={draft} set={set} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Messaging</CardTitle>
              <CardDescription>Available in prompts as {"{{icp.pains}}"}, {"{{icp.offer}}"} and so on.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-5">
                <ProductField draft={draft} set={set} />
              </div>
              <MessagingFields draft={draft} set={set} />
            </CardContent>
          </Card>
        </div>

        <div className="h-fit space-y-6 lg:sticky lg:top-16">
          <Card>
            <CardHeader>
              <CardTitle>Verification sources</CardTitle>
              <CardDescription>What research reads to decide whether a business is worth contacting.</CardDescription>
            </CardHeader>
            <CardContent>
              <VerificationSourcesFields draft={draft} set={set} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Analysis sources</CardTitle>
              <CardDescription>Each lead&apos;s recent posts, read to find something specific to open the email with.</CardDescription>
            </CardHeader>
            <CardContent>
              <AnalysisSourcesFields draft={draft} set={set} postsPerLead={settings.postsPerLead} maxPostAgeDays={settings.maxPostAgeDays} />
            </CardContent>
          </Card>
        </div>
      </fieldset>
      {editing && <EditIcpDefinition icp={icp} onClose={() => setEditing(false)} />}
    </div>
  )
}
