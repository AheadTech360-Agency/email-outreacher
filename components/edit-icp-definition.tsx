"use client"

import { useState } from "react"
import { toast } from "sonner"
import { IcpBasicsInputs, IcpRuleInputs, icpErrors, icpFields } from "@/components/lead-intel-icp-fields"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { IcpCreate } from "@/lib/api"
import { Say, usePlain } from "@/components/say"
import { useStore } from "@/lib/store"
import type { ICP } from "@/lib/types"

/** Edit an ICP's own fields. They're saved in Lead Intel's icps table, so Lead Intel uses them too. */
export function EditIcpDefinition({ icp, onClose }: { icp: ICP; onClose: () => void }) {
  const { icps, updateIcpDefinition } = useStore()
  const plain = usePlain()
  const [draft, setDraft] = useState<IcpCreate>(() => icpFields(icp))
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState("")

  const others = new Set(icps.filter((i) => i.id !== icp.id).map((i) => i.name.trim().toLowerCase()))
  const errors = icpErrors(draft, others)
  const valid = !Object.values(errors).some(Boolean)
  const shown = touched ? errors : {}
  const dirty = JSON.stringify(draft) !== JSON.stringify(icpFields(icp))

  const set = <K extends keyof IcpCreate>(key: K, value: IcpCreate[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setServerError("")
  }

  const save = async () => {
    setTouched(true)
    if (!valid) return
    setSaving(true)
    try {
      const { campaignNote } = await updateIcpDefinition(icp.id, draft)
      toast.success(`Saved ${draft.name.trim()}`, {
        description: plain ? "The next search and verification use the new definition." : "The next Google Maps or Apollo search, and the next research, use the new definition.",
      })
      // Only worth a second toast when the campaign changed or couldn't be set up.
      if (campaignNote && !campaignNote.startsWith("Its campaign is "))
        (campaignNote.startsWith("Campaign not set up") ? toast.warning : toast.info)(campaignNote)
      onClose()
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Couldn't save it.")
      setSaving(false)
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && !saving && onClose()}>
      <SheetContent className="w-full! gap-0 overflow-y-auto sm:max-w-xl!">
        <SheetHeader className="px-5 pt-5 pb-4">
          <SheetTitle className="text-lg">Edit {icp.name}</SheetTitle>
          <SheetDescription>
            <Say
              team="Searches and research use these. They're stored in Lead Intel's ICP table, which this app keeps using; companies already in a pipeline aren't checked again."
              plain="Searches and verification use these. Companies already found aren't checked again."
            />
          </SheetDescription>
        </SheetHeader>
        <form
          id="edit-icp"
          className="space-y-6 border-t border-rule px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <IcpBasicsInputs icp={draft} set={set} errors={shown} onBlurName={() => setTouched(true)} />
          <div className="space-y-3 border-t border-rule pt-5">
            <div>
              <h3 className="text-sm font-semibold">{plain ? "How to recognise them" : "How Lead Intel recognises them"}</h3>
              <p className="text-xs text-muted-foreground">
                {plain ? "The words and conditions a company must match to be verified." : "The rule Lead Intel uses to put a business in this ICP."}
              </p>
            </div>
            <IcpRuleInputs icp={draft} set={set} errors={shown} />
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
        </form>
        <SheetFooter className="flex-row justify-end gap-2 border-t border-rule px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="edit-icp" disabled={saving || !dirty}>
            {saving ? "Saving…" : plain ? "Save changes" : "Save in Lead Intel"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
