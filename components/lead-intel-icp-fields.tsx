"use client"

import type { ReactNode } from "react"
import { ICP_SOURCE_LABELS } from "@/components/icp-form"
import { Say } from "@/components/say"
import { TagInput } from "@/components/tag-input"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { IcpCreate } from "@/lib/api"
import type { IcpSource } from "@/lib/types"

// The ICP's own fields, exactly as Lead Intel stores them in its icps table. Used to add an ICP and to
// edit one; both write to Lead Intel (shared by both projects).

const SOURCES = Object.keys(ICP_SOURCE_LABELS) as IcpSource[]

export const EMPTY_ICP: IcpCreate = {
  name: "",
  industry: "",
  priority: 100,
  enabled: true,
  sources: [],
  anyOf: [],
  noneOf: [],
  websiteAnyOf: [],
  instagramAnyOf: [],
  requireAll: false,
  minFollowers: null,
  maxFollowers: null,
  searchTerms: [],
  requiresWebsite: false,
  minReviews: null,
  places: [],
}

export type IcpErrors = Record<"name" | "industry" | "priority" | "followers" | "reviews", string>
export type SetIcp = <K extends keyof IcpCreate>(key: K, value: IcpCreate[K]) => void

/** What's wrong with these fields, if anything. `takenNames` are other ICPs' names, lower-cased. */
export function icpErrors(icp: IcpCreate, takenNames: Set<string>): IcpErrors {
  return {
    name: !icp.name.trim() ? "Give the ICP a name" : takenNames.has(icp.name.trim().toLowerCase()) ? "An ICP with this name already exists" : "",
    industry: !icp.industry.trim() ? "Add the industry, e.g. Printing" : "",
    priority: !Number.isInteger(icp.priority) || icp.priority < 0 ? "Use a whole number, 0 or more" : "",
    followers:
      icp.minFollowers !== null && icp.maxFollowers !== null && icp.minFollowers > icp.maxFollowers
        ? "Fewest followers can't be more than most followers"
        : [icp.minFollowers, icp.maxFollowers].some((n) => n !== null && (!Number.isInteger(n) || n < 0))
          ? "Use whole numbers, 0 or more"
          : "",
    reviews: icp.minReviews !== null && (!Number.isInteger(icp.minReviews) || icp.minReviews < 0) ? "Use a whole number, 0 or more" : "",
  }
}

/** An ICP's Lead Intel fields, ready to send. */
export const icpFields = (icp: IcpCreate): IcpCreate => ({
  name: icp.name,
  industry: icp.industry,
  priority: icp.priority,
  enabled: icp.enabled,
  sources: icp.sources,
  anyOf: icp.anyOf,
  noneOf: icp.noneOf,
  websiteAnyOf: icp.websiteAnyOf,
  instagramAnyOf: icp.instagramAnyOf,
  requireAll: icp.requireAll,
  minFollowers: icp.minFollowers,
  maxFollowers: icp.maxFollowers,
  searchTerms: icp.searchTerms,
  requiresWebsite: icp.requiresWebsite,
  minReviews: icp.minReviews,
  places: icp.places,
})

const toNumber = (value: string) => (value.trim() === "" ? null : Number(value))

export function IcpField({ id, label, hint, error, children }: { id: string; label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {(error || hint) && <p className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{error || hint}</p>}
    </div>
  )
}

/** Name, industry, order, Google Maps search terms, on or off. */
export function IcpBasicsInputs({
  icp,
  set,
  errors,
  onBlurName,
  autoFocus,
}: {
  icp: IcpCreate
  set: SetIcp
  errors: Partial<IcpErrors>
  onBlurName?: () => void
  autoFocus?: boolean
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <IcpField id="icp-name" label="Name it" hint="For you, not the business" error={errors.name}>
          <Input
            id="icp-name"
            value={icp.name}
            autoFocus={autoFocus}
            onBlur={onBlurName}
            onChange={(e) => set("name", e.target.value)}
            aria-invalid={!!errors.name || undefined}
          />
        </IcpField>
      </div>
      <IcpField id="icp-industry" label="Industry" hint="e.g. Printing" error={errors.industry}>
        <Input id="icp-industry" value={icp.industry} onChange={(e) => set("industry", e.target.value)} aria-invalid={!!errors.industry || undefined} />
      </IcpField>
      <IcpField id="icp-priority" label="Order" hint="Lower is checked first" error={errors.priority}>
        <Input id="icp-priority" type="number" inputMode="numeric" value={icp.priority} onChange={(e) => set("priority", Number(e.target.value))} />
      </IcpField>
      <div className="sm:col-span-2">
        <IcpField
          id="icp-search-terms"
          label={<Say team="Words to find them on Google Maps" plain="Search words" />}
          hint={<Say team="What you'd type into Google Maps. Search Google Maps and Search Apollo start from these." plain="What you'd search for to find them. Quick Start starts from these." />}
        >
          <TagInput id="icp-search-terms" value={icp.searchTerms} onChange={(v) => set("searchTerms", v)} placeholder="screen printing" />
        </IcpField>
      </div>
      <Label className="flex cursor-pointer items-center gap-2 text-sm font-normal sm:col-span-2">
        <Switch checked={icp.enabled} onCheckedChange={(v) => set("enabled", v)} />
        Turned on
      </Label>
    </div>
  )
}

/** The rule Lead Intel uses to put a business in this ICP. */
export function IcpRuleInputs({ icp, set, errors }: { icp: IcpCreate; set: SetIcp; errors: Partial<IcpErrors> }) {
  return (
    <div className="space-y-4">
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Read</legend>
        <p className="text-xs text-muted-foreground">Which text to look in. None ticked means all of it.</p>
        <div className="grid gap-2 pt-1 sm:grid-cols-2">
          {SOURCES.map((s) => (
            <Label key={s} className="flex cursor-pointer items-center gap-2 text-sm font-normal">
              <Checkbox
                checked={icp.sources.includes(s)}
                onCheckedChange={(v) => set("sources", v === true ? [...icp.sources, s] : icp.sources.filter((x) => x !== s))}
              />
              {ICP_SOURCE_LABELS[s]}
            </Label>
          ))}
        </div>
      </fieldset>
      <IcpField id="icp-any-of" label="Any of these words" hint="Searched in whatever is ticked above.">
        <TagInput id="icp-any-of" value={icp.anyOf} onChange={(v) => set("anyOf", v)} placeholder="screen print, silkscreen" />
      </IcpField>
      <div className="grid gap-4 sm:grid-cols-2">
        <IcpField id="icp-website" label="On their website">
          <TagInput id="icp-website" value={icp.websiteAnyOf} onChange={(v) => set("websiteAnyOf", v)} />
        </IcpField>
        <IcpField id="icp-instagram" label="On their Instagram">
          <TagInput id="icp-instagram" value={icp.instagramAnyOf} onChange={(v) => set("instagramAnyOf", v)} />
        </IcpField>
      </div>
      <Label className="flex cursor-pointer items-start gap-2 text-sm font-normal">
        <Switch className="mt-0.5" checked={icp.requireAll} onCheckedChange={(v) => set("requireAll", v)} />
        <span>
          Every filled-in group must match
          <span className="block text-xs text-muted-foreground">Off: any one group is enough.</span>
        </span>
      </Label>
      <IcpField id="icp-none-of" label="…but never these words" hint="Checked across everything this rule reads. e.g. equipment, repair, wholesale">
        <TagInput id="icp-none-of" value={icp.noneOf} onChange={(v) => set("noneOf", v)} />
      </IcpField>
      <div className="grid gap-4 sm:grid-cols-3">
        <IcpField id="icp-min-followers" label="Fewest followers" error={errors.followers}>
          <Input
            id="icp-min-followers"
            type="number"
            inputMode="numeric"
            value={icp.minFollowers ?? ""}
            onChange={(e) => set("minFollowers", toNumber(e.target.value))}
          />
        </IcpField>
        <IcpField id="icp-max-followers" label="Most followers">
          <Input
            id="icp-max-followers"
            type="number"
            inputMode="numeric"
            value={icp.maxFollowers ?? ""}
            onChange={(e) => set("maxFollowers", toNumber(e.target.value))}
          />
        </IcpField>
        <IcpField id="icp-min-reviews" label={<Say team="Fewest Google reviews" plain="Fewest reviews" />} error={errors.reviews}>
          <Input
            id="icp-min-reviews"
            type="number"
            inputMode="numeric"
            value={icp.minReviews ?? ""}
            onChange={(e) => set("minReviews", toNumber(e.target.value))}
          />
        </IcpField>
      </div>
      <IcpField id="icp-places" label="Only in these places" hint="Towns or states. Empty means anywhere.">
        <TagInput places id="icp-places" value={icp.places} onChange={(v) => set("places", v)} placeholder="Chicago" />
      </IcpField>
      <Label className="flex cursor-pointer items-center gap-2 text-sm font-normal">
        <Switch checked={icp.requiresWebsite} onCheckedChange={(v) => set("requiresWebsite", v)} />
        Must have a website
      </Label>
    </div>
  )
}
