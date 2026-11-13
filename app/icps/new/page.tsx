"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { SUGGESTIONS } from "@/components/icp-form"
import { EMPTY_ICP, IcpBasicsInputs, IcpField as Field, IcpRuleInputs, icpErrors } from "@/components/lead-intel-icp-fields"
import { PageHeader } from "@/components/page-header"
import { TagInput } from "@/components/tag-input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { IcpCreate } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { isProspector } from "@/lib/roles"
import { useStore } from "@/lib/store"

/** Add an ICP. It goes into Lead Intel's ICPs (shared by both projects); who to reach stays in this workspace. */
export default function NewIcpPage() {
  const router = useRouter()
  const { icps, createIcp } = useStore()
  const { me } = useAuth()
  const [icp, setIcp] = useState<IcpCreate>(EMPTY_ICP)
  const [titles, setTitles] = useState<string[]>(["Owner", "Founder"])
  const [description, setDescription] = useState("")
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState("")

  const set = <K extends keyof IcpCreate>(key: K, value: IcpCreate[K]) => {
    setIcp((d) => ({ ...d, [key]: value }))
    setServerError("")
  }

  const errors = icpErrors(icp, new Set(icps.map((i) => i.name.trim().toLowerCase())))
  const valid = !Object.values(errors).some(Boolean)
  const shown = touched ? errors : {}

  const submit = async () => {
    setTouched(true)
    if (!valid) return
    setSaving(true)
    try {
      const { icp: created, warning, campaignNote } = await createIcp(icp, { titles, description })
      if (warning) toast.warning(warning)
      else
        toast.success(`Added ${created.name}`, {
          description: isProspector(me?.role)
            ? "Give it an offer below, then find companies for it on Quick Start."
            : "Find companies for it on the Companies page, with Google Maps or Apollo.",
        })
      if (campaignNote) (campaignNote.startsWith("Campaign not set up") ? toast.warning : toast.info)(campaignNote)
      router.push(`/icps/${created.id}`)
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Couldn't add the ICP.")
      setSaving(false)
    }
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 px-4 pt-5 text-[13px] text-muted-foreground md:px-8 md:pt-6">
        <Link href="/icps" className="hover:text-foreground">
          ICPs
        </Link>
        <ChevronRight className="size-3.5" />
        <span>New ICP</span>
      </nav>
      <div className="-mt-4 md:-mt-5">
        <PageHeader
          title="New ICP"
          description={isProspector(me?.role) ? "Who it is and where they are, for searching and checking companies. Who to reach is saved for this workspace."
            : "Who it is and where they are, for searching Google Maps and Apollo and checking companies. Who to reach is saved for this workspace."}
          actions={
            <>
              <Button variant="outline" asChild>
                <Link href="/icps">Cancel</Link>
              </Button>
              <Button type="submit" form="new-icp" disabled={saving}>
                {saving ? "Adding…" : "Add ICP"}
              </Button>
            </>
          }
        />
      </div>

      <form
        id="new-icp"
        className="grid gap-4 px-4 pb-10 md:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>The ICP</CardTitle>
              <CardDescription>{isProspector(me?.role) ? "Who they are and where." : "Saved in Lead Intel."}</CardDescription>
            </CardHeader>
            <CardContent>
              <IcpBasicsInputs icp={icp} set={set} errors={shown} onBlurName={() => setTouched(true)} autoFocus />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Who to reach</CardTitle>
              <CardDescription>
                {isProspector(me?.role) ? "Saved for this workspace. You can add messaging after." : "Saved for this workspace, not in Lead Intel. You can add messaging after."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field id="icp-titles" label="Job titles to reach" hint={isProspector(me?.role) ? "Who to reach at each company." : "Who to email at each company. Used to find stakeholders in Apollo."}>
                <TagInput id="icp-titles" value={titles} onChange={setTitles} placeholder="Owner, Founder" />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {SUGGESTIONS.titles
                    .filter((t) => !titles.includes(t))
                    .map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTitles((list) => [...list, t])}
                        className="inline-flex h-6 items-center rounded-full border px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        + {t}
                      </button>
                    ))}
                </div>
              </Field>
              <Field id="icp-description" label="Description" hint="For your team. Not sent to the model.">
                <Textarea id="icp-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{isProspector(me?.role) ? "How to recognise them" : "How Lead Intel recognises them"}</CardTitle>
            <CardDescription>
              {isProspector(me?.role) ? "The words and conditions a company must match to be verified." : "The rule Lead Intel uses to put a business in this ICP. Saved in Lead Intel."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IcpRuleInputs icp={icp} set={set} errors={shown} />
          </CardContent>
        </Card>

        {serverError && <p className="text-sm text-destructive lg:col-span-2">{serverError}</p>}
      </form>
    </>
  )
}
