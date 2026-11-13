"use client"

import { Checkbox } from "@/components/ui/checkbox"
import type { ProspectorPermissions } from "@/lib/types"

type Key = keyof ProspectorPermissions

const GROUPS: { key: Key; title: string; hint: string; options: { value: string; label: string; detail: string }[] }[] = [
  {
    key: "search",
    title: "Searches they can start",
    hint: "At least one.",
    options: [
      { value: "google_maps", label: "Google Maps", detail: "Local businesses in the places they pick" },
      { value: "linkedin", label: "LinkedIn", detail: "Company profiles that match the ICP" },
    ],
  },
  {
    key: "posts",
    title: "Posts their runs read",
    hint: "None ticked: their runs skip posts.",
    options: [
      { value: "linkedin", label: "LinkedIn", detail: "From the people and the company" },
      { value: "instagram", label: "Instagram", detail: "From the company's account" },
    ],
  },
  {
    key: "analysisReads",
    title: "What the analysis reads",
    hint: "None ticked: it works from the company's name, the ICP and who works there.",
    options: [
      { value: "website", label: "Website", detail: "The pages read and the contacts found there" },
      { value: "posts", label: "Posts", detail: "Whatever posts their runs read" },
      { value: "company_profile", label: "Company profiles", detail: "The LinkedIn listing and the Instagram bio" },
      { value: "people_profiles", label: "People's profiles", detail: "Headline, about, time in role and skills" },
    ],
  },
  {
    key: "analysisWrites",
    title: "What the analysis writes",
    hint: "At least one.",
    options: [
      { value: "company", label: "Company analysis", detail: "Fit, signals, hooks and who to contact first" },
      { value: "people", label: "People analysis", detail: "Who each person is, the angle and an opening line" },
    ],
  },
]

/** The checks at least one of which has to stay on. */
export const permissionErrors = (p: ProspectorPermissions) => ({
  search: p.search.length ? "" : "Pick at least one search",
  analysisWrites: p.analysisWrites.length ? "" : "Pick at least one part to write",
})

/** What an admin lets a Prospector do in Quick Start: which searches, whose posts, and what the analysis reads and writes. */
export function ProspectorPermissionsPicker({
  value,
  onChange,
  showErrors,
}: {
  value: ProspectorPermissions
  onChange: (next: ProspectorPermissions) => void
  showErrors: boolean
}) {
  const errors = permissionErrors(value)
  const toggle = (key: Key, option: string, on: boolean) => {
    const list = value[key] as string[]
    // Kept in the listed order, so what's saved reads the same way every time.
    const order = GROUPS.find((g) => g.key === key)!.options.map((o) => o.value)
    const next = order.filter((v) => (v === option ? on : list.includes(v)))
    onChange({ ...value, [key]: next })
  }
  return (
    <div className="space-y-4">
      {GROUPS.map((g) => {
        const error = showErrors ? (errors as Record<string, string>)[g.key] : ""
        return (
          <div key={g.key} className="space-y-1.5" role="group" aria-labelledby={`perm-${g.key}`}>
            <p id={`perm-${g.key}`} className="text-[13px] font-medium">
              {g.title}
            </p>
            <div className="divide-y divide-rule rounded-md border">
              {g.options.map((o) => (
                <label key={o.value} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50">
                  <Checkbox
                    checked={(value[g.key] as string[]).includes(o.value)}
                    onCheckedChange={(v) => toggle(g.key, o.value, v === true)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm">{o.label}</span>
                    <span className="block text-xs text-muted-foreground">{o.detail}</span>
                  </span>
                </label>
              ))}
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">{g.hint}</p>}
          </div>
        )
      })}
    </div>
  )
}
