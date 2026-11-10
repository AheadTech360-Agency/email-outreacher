"use client"

import { useEffect, useState } from "react"
import { PenLine } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { type Preview, errorText, previewEnrollment } from "@/lib/config-api"
import { cn } from "@/lib/utils"

/** Every email of the campaign as one lead gets it. Follow-ups Coldbrew writes ({{followUp}}) can be written now, so
 * they can be read before anything goes out; they're kept, and the same text is what's sent. Nothing is sent here. */
export function PreviewDialog({ wsId, enrollmentId, onClose }: { wsId: string; enrollmentId: string; onClose: () => void }) {
  const [data, setData] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [writing, setWriting] = useState(false)

  useEffect(() => {
    let live = true
    previewEnrollment(wsId, enrollmentId)
      .then((p) => live && setData(p))
      .catch((e: unknown) => live && setError(errorText(e)))
    return () => {
      live = false
    }
  }, [wsId, enrollmentId])

  const toWrite = data?.emails.filter((m) => m.state === "to_write").length ?? 0
  const write = async () => {
    setWriting(true)
    try {
      const p = await previewEnrollment(wsId, enrollmentId, true)
      setData(p)
      const problems = p.emails.filter((m) => m.state === "problem")
      if (problems.length) toast.error("Some follow-ups couldn't be written", { description: problems.map((m) => m.note).filter(Boolean).join(" ") })
      else toast.success(`Wrote ${toWrite} ${toWrite === 1 ? "follow-up" : "follow-ups"}`, { description: "Kept for this lead: this is the text that goes out." })
    } catch (e) {
      toast.error("Couldn't write the follow-ups", { description: errorText(e) })
    } finally {
      setWriting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !writing && onClose()}>
      <DialogContent className="gap-4 sm:max-w-2xl!">
        <DialogHeader>
          <DialogTitle>{data ? `Emails to ${data.leadName}` : "Preview"}</DialogTitle>
          <DialogDescription>
            {data ? `${data.leadEmail ?? "No address"}${data.sender ? `, sent from ${data.sender}` : ""}. Exactly what goes out; nothing is sent from here.` : "Loading…"}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-[13px] text-negative">
            {error}
          </p>
        ) : !data ? (
          <p className="text-[13px] text-muted-foreground">Loading the emails…</p>
        ) : (
          <ol className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {data.emails.map((m) => (
              <li key={m.stepOrder} className={cn("rounded-lg border", m.state === "problem" && "border-negative/40")}>
                <div className="flex flex-wrap items-baseline gap-x-3 border-b bg-muted/40 px-4 py-2 text-[12.5px]">
                  <span className="font-semibold">Email {m.stepOrder}</span>
                  <span className="text-muted-foreground">{m.stepOrder === 1 ? "first" : `${m.delayDays} ${m.delayDays === 1 ? "day" : "days"} after the last`}</span>
                  <span className="min-w-0 flex-1 truncate text-right text-foreground/80">{m.subject}</span>
                </div>
                {m.state === "to_write" ? (
                  <p className="flex items-center gap-2 px-4 py-3 text-[13px] text-muted-foreground">
                    <PenLine className="size-4 flex-none" aria-hidden /> {m.note}
                  </p>
                ) : (
                  <>
                    <pre className="px-4 py-3 font-sans text-[13.5px] leading-6 whitespace-pre-wrap">{m.body}</pre>
                    {m.note && <p className="border-t px-4 py-2 text-[12.5px] text-negative">{m.note}</p>}
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={writing}>
            Close
          </Button>
          {toWrite > 0 && (
            <Button onClick={() => void write()} disabled={writing}>
              <PenLine /> {writing ? "Writing…" : `Write ${toWrite === 1 ? "the follow-up" : `the ${toWrite} follow-ups`} now`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
