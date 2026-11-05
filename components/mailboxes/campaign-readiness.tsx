"use client"

import { useState } from "react"
import { CheckCircle2, CircleHelp, ShieldCheck, TriangleAlert } from "lucide-react"
import { fetchCampaignReadiness, type CampaignReadiness } from "@/lib/api"
import { Button } from "@/components/ui/button"

export function CampaignReadinessPanel({ wsId, campaignId }: { wsId: string; campaignId: string }) {
  const [data, setData] = useState<CampaignReadiness | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const check = async () => {
    setBusy(true); setError("")
    try { setData(await fetchCampaignReadiness(wsId, campaignId)) }
    catch (e) { setError(e instanceof Error ? e.message : "Could not check campaign") }
    finally { setBusy(false) }
  }
  return <div className="w-full space-y-2">
    <Button size="sm" variant="outline" disabled={busy} onClick={() => void check()}><ShieldCheck /> {busy ? "Checking..." : data ? "Refresh readiness" : "Check readiness"}</Button>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {data && <div className="space-y-3 rounded-md bg-muted/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><p className="font-medium">{data.status === "active" ? "Campaign is active" : data.blocking ? `${data.blocking} checks need attention` : "No known blockers; some checks need confirmation"}</p>
        <span className="text-muted-foreground">{data.timezone ?? "Timezone not exposed"}</span></div>
      <ul className="space-y-2">{data.checks.map((item) => <li key={item.key} className="flex items-start gap-2 text-xs">
        {item.status === "pass" ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-positive" /> : item.status === "fail" ? <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" /> : <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
        <span><span className="sr-only">{item.status === "pass" ? "Passed: " : item.status === "fail" ? "Needs attention: " : "Not verified: "}</span>{item.message}</span>
      </li>)}</ul>
      <p className="text-xs text-muted-foreground">Read-only check at {new Date(data.checkedAt).toLocaleTimeString()}. Activating a campaign in CheapSequencer sends to every enrolled lead on its schedule. Coldbrew never activates one.</p>
    </div>}
  </div>
}
