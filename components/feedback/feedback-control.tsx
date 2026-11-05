"use client"

import { useEffect, useState } from "react"
import { ThumbsDown, ThumbsUp } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { type EmailDraft, type FeedbackTag, clearRating, rateEmail } from "@/lib/api"
import { cn } from "@/lib/utils"

export const GOOD_TAGS: { value: FeedbackTag; label: string }[] = [
  { value: "strong_hook", label: "Strong hook" },
  { value: "right_tone", label: "Right tone" },
  { value: "clear_cta", label: "Clear ask" },
  { value: "send_as_is", label: "Would send as is" },
]

export const BAD_TAGS: { value: FeedbackTag; label: string }[] = [
  { value: "too_long", label: "Too long" },
  { value: "too_generic", label: "Too generic" },
  { value: "wrong_hook", label: "Wrong hook" },
  { value: "tone_off", label: "Tone off" },
  { value: "made_up_facts", label: "Made-up facts" },
  { value: "weak_cta", label: "Weak ask" },
  { value: "wrong_person", label: "Wrong person" },
]

export const TAG_LABEL = Object.fromEntries([...GOOD_TAGS, ...BAD_TAGS].map((t) => [t.value, t.label])) as Record<FeedbackTag, string>

/** Rate one email good or bad, with tags and a note. Ratings are shown to Claude as examples next time. */
export function FeedbackControl({
  workspaceId,
  draft,
  onSaved,
  onDirtyChange,
}: {
  workspaceId: string
  draft: EmailDraft
  onDirtyChange?: (dirty: boolean) => void
  onSaved: (updated: EmailDraft) => void
}) {
  const [rating, setRating] = useState<"good" | "bad" | null>(draft.feedback?.rating ?? null)
  const [tags, setTags] = useState<FeedbackTag[]>(draft.feedback?.tags ?? [])
  const [note, setNote] = useState(draft.feedback?.note ?? "")
  const [busy, setBusy] = useState(false)
  const saved = draft.feedback
  const dirty =
    rating !== (saved?.rating ?? null) || note.trim() !== (saved?.note ?? "") || tags.join() !== (saved?.tags ?? []).join()
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  const options = rating === "bad" ? BAD_TAGS : GOOD_TAGS

  const pick = (next: "good" | "bad") => {
    if (next === rating) return
    setRating(next)
    setTags([])
  }

  const save = async () => {
    if (!rating) return
    setBusy(true)
    try {
      onSaved(await rateEmail(workspaceId, draft.id, { rating, tags, note: note.trim() }))
      toast.success(rating === "good" ? "Marked good" : "Marked bad", { description: "Claude sees it as an example for this ICP from now on." })
    } catch (e) {
      toast.error("Couldn't save the rating", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    try {
      onSaved(await clearRating(workspaceId, draft.id))
      setRating(null)
      setTags([])
      setNote("")
      toast.success("Rating removed")
    } catch (e) {
      toast.error("Couldn't remove it", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Rating" className="flex gap-2">
        {(
          [
            { value: "good", label: "Good", icon: ThumbsUp, on: "border-positive bg-positive/10 text-positive" },
            { value: "bad", label: "Bad", icon: ThumbsDown, on: "border-negative bg-negative/10 text-negative" },
          ] as const
        ).map(({ value, label, icon: Icon, on }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            onClick={() => pick(value)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              rating === value ? on : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {rating && (
        <>
          <fieldset className="space-y-1.5">
            <legend className="text-xs text-muted-foreground">{rating === "good" ? "What worked" : "What was wrong"}</legend>
            <div className="flex flex-wrap gap-1.5">
              {options.map((t) => {
                const on = tags.includes(t.value)
                return (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTags((list) => (on ? list.filter((x) => x !== t.value) : [...list, t.value]))}
                    className={cn(
                      "h-7 rounded-full border px-2.5 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      on ? "border-data bg-data/10 font-medium" : "text-muted-foreground hover:bg-muted/60",
                    )}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor={`note-${draft.id}`} className="text-xs font-normal text-muted-foreground">
              Feedback for Claude (optional)
            </Label>
            <Textarea
              id={`note-${draft.id}`}
              rows={2}
              placeholder={rating === "good" ? "What to keep doing" : "What to do differently, e.g. open with their product, not our agency"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!rating || !dirty || busy} onClick={() => void save()}>
          {busy ? "Saving…" : saved ? "Update rating" : "Save rating"}
        </Button>
        {saved && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void clear()}>
            Remove rating
          </Button>
        )}
      </div>
    </div>
  )
}
