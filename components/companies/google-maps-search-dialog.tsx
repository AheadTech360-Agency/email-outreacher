"use client"

import { useState } from "react"
import { AlertTriangle, MapPin } from "lucide-react"
import { TagInput } from "@/components/tag-input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { type ApiIcp, type SourceFindResult, findCompanies } from "@/lib/api"
import { formatUsd } from "@/lib/format"

// Google bills $0.035 per business search and $0.032 per place lookup; this is the ceiling.
const PER_REQUEST_USD = 0.035

/** Find local businesses for an ICP on Google Maps (Places API); they're researched and scored next. */
export function GoogleMapsSearchDialog({
  workspaceId,
  icps,
  initialIcpId,
  onClose,
  onFound,
}: {
  workspaceId: string
  icps: ApiIcp[]
  initialIcpId: string
  onClose: () => void
  /** Called with the ICP the new companies were added to. */
  onFound: (icpId: string) => void
}) {
  const [icpId, setIcpId] = useState(initialIcpId)
  const icp = icps.find((i) => i.id === icpId) ?? icps[0]
  const defaultTerms = (i: ApiIcp) => (i.searchTerms.length ? i.searchTerms : [i.industry])
  const [terms, setTerms] = useState<string[]>(defaultTerms(icp))
  const [locations, setLocations] = useState<string[]>(icp.places)
  const [radius, setRadius] = useState("10")
  const [maxSearches, setMaxSearches] = useState("20")
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SourceFindResult | null>(null)
  const [failure, setFailure] = useState("")

  const radiusMiles = Number(radius)
  const limit = Number(maxSearches)
  const errors = {
    terms: terms.length ? "" : "Add a search term, e.g. screen printing.",
    locations: locations.length ? "" : "Add a city, state or postcode. Google Maps searches around a place.",
    radius: Number.isFinite(radiusMiles) && radiusMiles >= 1 && radiusMiles <= 50 ? "" : "Use 1 to 50 miles.",
    limit: Number.isInteger(limit) && limit >= 1 && limit <= 500 ? "" : "Use a whole number from 1 to 500.",
  }
  const valid = !Object.values(errors).some(Boolean)

  const run = async () => {
    if (!valid) return
    setRunning(true)
    setFailure("")
    try {
      const r = await findCompanies(workspaceId, {
        icpId: icp.id,
        sources: ["google_maps"],
        googleMaps: { searchTerms: terms, locations, radiusMiles, maxSearches: limit },
      })
      setResult(r.googleMaps)
      if ((r.googleMaps?.added ?? 0) > 0) onFound(icp.id)
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "The search failed.")
    } finally {
      setRunning(false)
    }
  }

  // Another ICP: start over from its search terms and places.
  const changeIcp = (id: string) => {
    const next = icps.find((i) => i.id === id)
    if (!next) return
    setIcpId(id)
    setTerms(defaultTerms(next))
    setLocations(next.places)
    setResult(null)
    setFailure("")
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl!">
        <DialogHeader>
          <DialogTitle>Search Google Maps</DialogTitle>
          <DialogDescription>
            Local businesses for each search term around each place, the same way Lead Intel finds them. They&apos;re researched
            and scored next. National chains and companies already in the pipeline are skipped.
          </DialogDescription>
        </DialogHeader>

        <form
          id="maps-search"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void run()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="maps-icp">ICP</Label>
            <Select value={icp.id} onValueChange={changeIcp} disabled={running}>
              <SelectTrigger id="maps-icp" className="w-60!">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {icps.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maps-terms">Search terms</Label>
            <TagInput id="maps-terms" value={terms} onChange={setTerms} placeholder="screen printing" />
            <p className={errors.terms ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {errors.terms || "What you'd type into Google Maps. From the ICP's search terms."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maps-locations">Places</Label>
            <TagInput places id="maps-locations" value={locations} onChange={setLocations} placeholder="Chicago, IL" />
            <p className={errors.locations ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {errors.locations || "Cities or postcodes anywhere, like Chicago, IL or London, or a whole state or country (searched in full). Press Enter after each."}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="maps-radius">Radius (miles)</Label>
              <Input id="maps-radius" type="number" min={1} max={50} value={radius} onChange={(e) => setRadius(e.target.value)} />
              <p className={errors.radius ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                {errors.radius || "Around each city. A state or country is searched in full."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maps-limit">Most Google requests</Label>
              <Input id="maps-limit" type="number" min={1} max={500} value={maxSearches} onChange={(e) => setMaxSearches(e.target.value)} />
              <p className={errors.limit ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                {errors.limit || `Up to ${formatUsd(limit * PER_REQUEST_USD)}. Each returns up to 20 businesses.`}
              </p>
            </div>
          </div>

          {failure && <p className="text-sm text-destructive">{failure}</p>}
          {result?.error && (
            <p className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 flex-none text-warning" />
              {result.error}
            </p>
          )}
          {result && !result.error && (
            <div className="space-y-1 rounded-md bg-muted/50 px-3 py-2 text-sm">
              <p className="tabular-nums">
                {result.found} found, {result.added} new
                {result.duplicates ? `, ${result.duplicates} already in the pipeline` : ""}
                {result.excluded ? `, ${result.excluded} on the do-not-contact list` : ""}. {result.searches ?? 0} Google
                request{result.searches === 1 ? "" : "s"}, {formatUsd(result.costUsd ?? 0)}.
              </p>
              {result.notes?.map((n) => (
                <p key={n} className="text-xs text-muted-foreground">
                  {n}
                </p>
              ))}
            </div>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={running}>
            {result ? "Done" : "Cancel"}
          </Button>
          <Button type="submit" form="maps-search" disabled={running || !valid}>
            <MapPin /> {running ? "Searching…" : "Search Google Maps"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
