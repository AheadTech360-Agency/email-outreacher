"use client"
import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fetchPersonTimeline, useApi } from "@/lib/api"

export function PersonTimeline({ wsId, personId }: { wsId: string; personId: string }) {
  const data = useApi(() => fetchPersonTimeline(wsId, personId), [wsId, personId])
  const [query, setQuery] = useState("")
  const events = (data.data?.events ?? []).filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <div className="max-w-4xl space-y-4">
    <div className="flex gap-2"><Input aria-label="Search lead timeline" placeholder="Search research, emails, ratings or replies" value={query} onChange={(e) => setQuery(e.target.value)} /><Button variant="outline" onClick={data.reload}>Refresh</Button></div>
    <p className="text-xs text-muted-foreground">Latest 100 recorded events, newest first. Events only appear when their timestamps are recorded; provider events appear after webhook delivery or sync.</p>
    {data.error && <p role="alert" className="text-sm text-destructive">{data.error}</p>}
    {!data.data && !data.error && <p role="status">Loading timeline...</p>}
    {data.data && !events.length && <p className="py-6 text-sm text-muted-foreground">No matching recorded events.</p>}
    <ol className="space-y-4 border-l pl-5">{events.map((event) => <li key={event.id} className="relative rounded-md border p-4">
      <span className="absolute -left-7 top-5 size-3 rounded-full border-2 border-background bg-primary" />
      <div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-medium">{event.title}</p><time className="text-xs text-muted-foreground" dateTime={event.at}>{new Date(event.at).toLocaleString()}</time></div>
      {event.detail && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{event.detail}</p>}
      {event.emailId && <Link className="mt-2 inline-block text-xs text-data hover:underline" href={`/review?email=${encodeURIComponent(event.emailId)}`}>Open email</Link>}
    </li>)}</ol>
  </div>
}
