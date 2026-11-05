"use client"
import { useState } from "react"
import { BookmarkPlus, RotateCw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth"
import { api, useApi } from "@/lib/api"
import { addSelection, parseViews, viewStorageKey } from "@/lib/list-workflow"

interface DatabaseView { id: string; name: string; filters: Record<string, string>; visibility: "personal" | "workspace"; canManage: boolean }
interface ListToolsProps {
  wsId: string; scope: string; filters: Record<string, string>; onApply: (filters: Record<string, string>) => void; onRefresh: () => void
}
export function ListTools(props: ListToolsProps) {
  const { me } = useAuth()
  return <DatabaseListTools key={`${me?.id}:${me?.role}:${props.wsId}:${props.scope}`} {...props} />
}
function DatabaseListTools({ wsId, scope, filters, onApply, onRefresh }: ListToolsProps) {
  const { me } = useAuth()
  const canShare = me?.role === "admin" || me?.role === "management"
  const saved = useApi(() => wsId && me ? api<DatabaseView[]>(`/saved-views?page=${encodeURIComponent(scope)}`, {workspaceId:wsId, fresh:true}) : Promise.resolve([]), [wsId, scope, me?.id, me?.role])
  const views = saved.data ?? []
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [visibility, setVisibility] = useState<"personal" | "workspace">("personal")
  const [busy, setBusy] = useState(false)
  const reportError = (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not update saved views")
  const save = async () => {
    setBusy(true)
    try {
      await api<DatabaseView>("/saved-views", {workspaceId:wsId, method:"POST", body:{page:scope, name:name.trim(), visibility, filters}})
      setName(""); saved.reload(); toast.success("View saved to the database")
    } catch (e) { reportError(e) } finally { setBusy(false) }
  }
  const remove = async (id: string) => {
    setBusy(true)
    try { await api<void>(`/saved-views/${id}`, {workspaceId:wsId, method:"DELETE"}); saved.reload() }
    catch (e) { reportError(e) } finally { setBusy(false) }
  }
  const importBrowserViews = async () => {
    if (!me) return
    setBusy(true)
    try {
      const key = viewStorageKey(me.id, wsId, scope)
      const old = parseViews(localStorage.getItem(key) ?? "[]")
      if (!old.length) { toast.info("No browser views to import for this page"); return }
      for (const view of old) {
        // Preserve an existing database view with the same name.
        if (views.some((v) => v.visibility === "personal" && v.name.toLowerCase() === view.name.toLowerCase())) continue
        await api<DatabaseView>("/saved-views", {workspaceId:wsId, method:"POST", body:{page:scope,name:view.name,visibility:"personal",filters:view.filters}})
      }
      localStorage.removeItem(key)
      toast.success("Browser views imported as personal views")
    } catch (e) { reportError(e) } finally { saved.reload(); setBusy(false) }
  }
  return <div className="flex items-center gap-1">
    {views.length > 0 && <Select value="choose" disabled={saved.loading || !!saved.error} onValueChange={(id) => { const view = views.find((v) => v.id === id); if (view) onApply(view.filters) }}>
      <SelectTrigger size="sm" className="w-44" aria-label="Saved filter views"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="choose">Saved views ({views.length})</SelectItem>{views.map((v) => <SelectItem key={v.id} value={v.id}>{v.name} · {v.visibility === "workspace" ? "Workspace" : "Personal"}</SelectItem>)}</SelectContent>
    </Select>}
    <Button variant="ghost" size="sm" disabled={!me || !wsId} onClick={() => setOpen(true)} title="Save these filters as a view, or manage saved views"><BookmarkPlus /> {views.length ? "Views" : "Save view"}</Button>
    {saved.error && <span role="alert" className="text-xs text-destructive">{saved.error} <button className="underline" onClick={saved.reload}>Retry</button></span>}
    <Button variant="ghost" size="icon-sm" aria-label="Refresh" title="Refresh" onClick={() => { onRefresh(); saved.reload() }}><RotateCw /></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Saved views</DialogTitle><DialogDescription>Personal views are private to you in this workspace and sync across devices. Workspace views are shared with its members. Saving the same name in the same location updates that view.</DialogDescription></DialogHeader>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (name.trim() && !busy) void save() }}>
        <Input aria-label="Saved view name" maxLength={60} placeholder="e.g. Retail / no email" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex gap-2">
          {canShare ? <Select value={visibility} onValueChange={(v) => setVisibility(v as "personal" | "workspace")}><SelectTrigger className="flex-1" aria-label="Save view location"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="personal">Personal · only me</SelectItem><SelectItem value="workspace">Workspace · all members</SelectItem></SelectContent></Select> : <span className="flex-1 self-center text-sm text-muted-foreground">Personal · only me</span>}
          <Button disabled={!name.trim() || busy || saved.loading || !!saved.error}>Save filters</Button>
        </div>
      </form>
      <ul className="max-h-64 space-y-1 overflow-y-auto">{views.map((view) => <li key={view.id} className="flex items-center justify-between gap-2 border-b py-2"><button className="text-left text-sm hover:underline" onClick={() => { onApply(view.filters); setOpen(false) }}>{view.name}<span className="ml-2 text-xs text-muted-foreground">{view.visibility === "workspace" ? "Workspace" : "Personal"}</span></button>{view.canManage && <Button disabled={busy} variant="ghost" size="icon-sm" aria-label={`Delete saved view ${view.name}`} onClick={() => void remove(view.id)}><Trash2 /></Button>}</li>)}</ul>
      <Button variant="outline" size="sm" disabled={busy || saved.loading || !!saved.error} onClick={() => void importBrowserViews()}>Import existing browser views</Button>
    </DialogContent></Dialog>
  </div>
}
export function BulkSelection({ matchingIds, pageIds, selected, onChange, disabled = false }: {
  matchingIds: string[]; pageIds: string[]; selected: Set<string>; onChange: (ids: Set<string>) => void; disabled?: boolean
}) {
  // Gmail's pattern: the table's own box selects the page; once anything is picked, this offers every match.
  const matching = new Set(matchingIds)
  const hidden = [...selected].filter((id) => !matching.has(id)).length
  const all = matchingIds.length > 0 && matchingIds.every((id) => selected.has(id))
  if (!selected.size) return null
  return <span className="flex items-center gap-1 text-xs text-muted-foreground">
    {hidden > 0 && <span className="tabular-nums">({hidden} outside these filters)</span>}
    {!all && matchingIds.length > pageIds.length && <Button size="sm" variant="ghost" className="h-7" disabled={disabled}
      onClick={() => onChange(addSelection(selected, matchingIds))}>Select all {matchingIds.length.toLocaleString()} matching</Button>}
  </span>
}
