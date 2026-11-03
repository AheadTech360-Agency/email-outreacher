"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Download, ListTree, Plus, Search, Sparkles, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { WorkspaceGate } from "@/components/companies/backend-state"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { IcpDraftPanel } from "@/components/smart-lists/icp-draft-panel"
import { EmptyState } from "@/components/empty-state"
import { ManagerOnly } from "@/components/manager-only"
import { PageHeader } from "@/components/page-header"
import { Pager } from "@/components/pager"
import { Pill } from "@/components/status"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  createSmartList, deleteSmartList, downloadCsv, draftSmartListIcp, fetchIcps, fetchPipeline, fetchSmartList, fetchSmartLists, moveToSmartList, renameSmartList, sortSmartLists,
  useApi, type SmartList, type SmartListKind,
} from "@/lib/api" // prettier-ignore
import { useAuth } from "@/lib/auth"
import { formatUsd } from "@/lib/format"
import { canManage } from "@/lib/roles"
import { cn } from "@/lib/utils"

const SORT_LIMIT = 2000

export default function SmartListsPage() {
  return (
    <>
      <PageHeader
        title="Smart lists"
        description="Your companies and people, grouped by industry and by role."
      />
      <div className="px-4 pb-10 md:px-8">
        <WorkspaceGate>{(wsId) => <SmartLists key={wsId} wsId={wsId} />}</WorkspaceGate>
      </div>
    </>
  )
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : undefined)

function SmartLists({ wsId }: { wsId: string }) {
  const [kind, setKind] = useState<SmartListKind>("company")
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [sorting, setSorting] = useState(false)
  const lists = useApi(() => fetchSmartLists(wsId, kind), [wsId, kind])
  const what = kind === "company" ? "companies" : "people"

  const sort = async () => {
    setSorting(true)
    try {
      const r = await sortSmartLists(wsId, kind, SORT_LIMIT)
      const parts = [`${r.sorted} sorted`]
      if (r.duplicates) parts.push(`${r.duplicates} duplicate${r.duplicates === 1 ? "" : "s"} joined their twin's list`)
      if (r.matchedIcp) parts.push(`${r.matchedIcp} matched to an ICP`)
      if (r.newLists.length) parts.push(`new: ${r.newLists.join(", ")}`)
      if (r.drafted.length) parts.push(`ICP drafted for ${r.drafted.join(", ")}`)
      if (r.left) parts.push(`${r.left} left to sort`)
      if (r.errors.length) toast.error("Sorting stopped early", { description: r.errors[0] })
      toast.success(`Smart lists updated · ${formatUsd(r.costUsd)}`, { description: parts.join(" · ") })
      lists.reload()
    } catch (e) {
      toast.error("Couldn't sort them", { description: errorText(e) })
    } finally {
      setSorting(false)
    }
  }

  const unsorted = lists.data?.unsorted ?? 0
  const all = lists.data?.lists ?? []
  // Company lists with no ICP yet: a draft waiting for you, or none drafted (never "Uncategorized").
  const waiting = kind === "company" ? all.filter((l) => !l.leadIntelIcpId && l.icpDraft) : []
  const undrafted = kind === "company" ? all.filter((l) => !l.leadIntelIcpId && !l.icpDraft && l.name !== "Uncategorized" && l.count > 0) : []
  const [drafting, setDrafting] = useState(0)

  const draftAll = async () => {
    let done = 0
    let failed = 0
    for (const l of undrafted) {
      setDrafting(++done)
      try {
        await draftSmartListIcp(wsId, l.id)
      } catch {
        failed += 1
      }
    }
    setDrafting(0)
    lists.reload()
    if (failed) toast.error(`${failed} couldn't be drafted`)
    else toast.success(`Drafted ICPs for ${undrafted.length} list${undrafted.length === 1 ? "" : "s"}`, { description: "Review each one and click Create ICP." })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={kind}
          onValueChange={(v) => {
            setKind(v as SmartListKind)
            setOpenId(null)
          }}
        >
          <TabsList>
            <TabsTrigger value="company">Companies</TabsTrigger>
            <TabsTrigger value="person">People</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-sm text-muted-foreground">
          {lists.data ? `${unsorted} ${what} not in a list yet` : "Loading…"}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          {kind === "person" && (
            <Button
              variant="outline"
              onClick={() => downloadCsv(wsId, "/smart-lists/people.csv", "people.csv").catch((e) => toast.error(errorText(e)))}
            >
              <Download /> All people (CSV)
            </Button>
          )}
          <ManagerOnly>
            <Button variant="outline" onClick={() => setCreating(true)}>
              <Plus /> New list
            </Button>
          </ManagerOnly>
          <ManagerOnly>
            <Button disabled={sorting || !unsorted} onClick={() => void sort()}>
              <Sparkles /> {sorting ? "Sorting…" : `Sort ${Math.min(unsorted, SORT_LIMIT)} ${what}`}
            </Button>
          </ManagerOnly>
        </div>
      </div>
            {(waiting.length > 0 || undrafted.length > 0) && (
        <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
          {waiting.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-medium">
                {waiting.length} {waiting.length === 1 ? "list has a draft ICP" : "lists have a draft ICP"} waiting for you to review and create
              </p>
              <div className="flex flex-wrap gap-1.5">
                {waiting.map((l) => (
                  <Button key={l.id} size="sm" variant="outline" className="h-7" onClick={() => setOpenId(l.id)}>
                    {l.name} ({l.count})
                  </Button>
                ))}
              </div>
            </div>
          )}
          {undrafted.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                No ICP drafted yet for {undrafted.map((l) => l.name).join(", ")}.
              </span>
              <ManagerOnly>
                <Button size="sm" variant="outline" className="h-7" disabled={drafting > 0} onClick={() => void draftAll()}>
                  <Sparkles /> {drafting ? `Drafting ${drafting} of ${undrafted.length}…` : `Draft ${undrafted.length === 1 ? "it" : `all ${undrafted.length}`}`}
                </Button>
              </ManagerOnly>
              <span className="text-xs text-muted-foreground">One small Claude call each, logged on Usage.</span>
            </div>
          )}
        </div>
      )}

      {lists.data && lists.data.lists.length === 0 ? (
        <EmptyState
          icon={ListTree}
          title="No smart lists yet"
          description={
            unsorted
              ? `Sort your ${what} and Claude puts each one in a broad list, like ${kind === "company" ? "Retail or Manufacturing" : "Owners & Executives or Marketing"}.`
              : kind === "company"
                ? "Find companies on the Companies page, or import an Apollo CSV on People, then sort them here."
                : "Add people on the People page, or import an Apollo CSV, then sort them here."
          }
        />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[280px_1fr]">
          <ul className="space-y-1 lg:sticky lg:top-4 lg:max-h-[calc(100svh-2rem)] lg:overflow-y-auto lg:pr-1">
            {(lists.data?.lists ?? []).map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(l.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/50",
                    openId === l.id && "border-primary bg-muted/60",
                  )}
                >
                  <span className="truncate font-medium">{l.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {l.leadIntelIcpId ? <Pill tone="positive">ICP</Pill> : l.icpDraft ? <Pill tone="info">Draft ICP</Pill> : null}
                    <span className="tabular-nums text-muted-foreground">{l.count}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {openId ? (
            <ListDetail
              key={openId}
              wsId={wsId}
              id={openId}
              lists={lists.data?.lists ?? []}
              onChanged={lists.reload}
              onDeleted={() => {
                setOpenId(null)
                lists.reload()
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Pick a list to see who&apos;s in it.</p>
          )}
        </div>
      )}
      <NewListDialog
        wsId={wsId}
        kind={kind}
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(l) => {
          setCreating(false)
          lists.reload()
          setOpenId(l.id)
        }}
      />
    </div>
  )
}

const NEW_LIST = "__new__"

function NewListDialog({
  wsId,
  kind,
  open,
  onClose,
  onCreated,
}: {
  wsId: string
  kind: SmartListKind
  open: boolean
  onClose: () => void
  onCreated: (list: SmartList) => void
}) {
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const create = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const list = await createSmartList(wsId, kind, name.trim())
      toast.success(`Created ${list.name}`, { description: `Move ${kind === "company" ? "companies" : "people"} into it from another list.` })
      setName("")
      onCreated(list)
    } catch (e) {
      toast.error("Couldn't create it", { description: errorText(e) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md!">
        <DialogHeader>
          <DialogTitle>New {kind === "company" ? "company" : "people"} list</DialogTitle>
          <DialogDescription>An empty list. Move {kind === "company" ? "companies" : "people"} into it, and sorting puts new ones in it when they fit.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
          className="space-y-1.5"
        >
          <Label htmlFor="new-list-name">Name</Label>
          <Input id="new-list-name" autoFocus value={name} maxLength={60} placeholder={kind === "company" ? "Screen printers" : "Marketing leads"} onChange={(e) => setName(e.target.value)} />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy || !name.trim()} onClick={() => void create()}>
            {busy ? "Creating…" : "Create list"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ListDetail({
  wsId,
  id,
  lists,
  onChanged,
  onDeleted,
}: {
  wsId: string
  id: string
  lists: SmartList[]
  onChanged: () => void
  onDeleted: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [search, setSearch] = useState("")
  const [q, setQ] = useState("")
  const list = useApi(() => fetchSmartList(wsId, id, page, pageSize, q), [wsId, id, page, pageSize, q])
  const [name, setName] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [target, setTarget] = useState("")
  const [newName, setNewName] = useState("")
  const [moving, setMoving] = useState(false)
  const { me } = useAuth()
  const manager = canManage(me?.role)

  // Search once typing stops, from page 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const d = list.data
  if (!d) return <p className="text-sm text-muted-foreground">{list.error ?? "Loading…"}</p>

  const rename = async () => {
    if (!name?.trim() || name.trim() === d.name) return setName(null)
    try {
      await renameSmartList(wsId, id, name.trim())
      setName(null)
      list.reload()
      onChanged()
    } catch (e) {
      toast.error("Couldn't rename it", { description: errorText(e) })
    }
  }
  const slug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "list"
  const rows = d.kind === "company" ? d.companies : d.people
  const pageIds = rows.map((r) => r.id)
  const allPicked = pageIds.length > 0 && pageIds.every((x) => picked.has(x))
  const pages = Math.max(1, Math.ceil(d.matching / d.pageSize))
  const toggle = (rowId: string) =>
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  const togglePage = () =>
    setPicked((s) => {
      const next = new Set(s)
      for (const x of pageIds) {
        if (allPicked) next.delete(x)
        else next.add(x)
      }
      return next
    })
  const others = lists.filter((l) => l.id !== id)
  const what = (n: number) => (d.kind === "company" ? (n === 1 ? "company" : "companies") : n === 1 ? "person" : "people")
  const first = (page - 1) * d.pageSize + 1
  const last = Math.min(page * d.pageSize, d.matching)

  const move = async () => {
    if (!picked.size || !target || (target === NEW_LIST && !newName.trim())) return
    const to = target === NEW_LIST ? { newName: newName.trim() } : { listId: target }
    setMoving(true)
    try {
      const r = await moveToSmartList(wsId, d.kind, [...picked], to)
      toast.success(`Moved ${r.moved} ${what(r.moved)} to ${r.toListName}`)
      setPicked(new Set())
      setTarget("")
      setNewName("")
      list.reload()
      onChanged()
    } catch (e) {
      toast.error("Couldn't move them", { description: errorText(e) })
    } finally {
      setMoving(false)
    }
  }

  return (
    <section className="min-w-0 space-y-5 rounded-lg border p-5">
      <div className="flex flex-wrap items-center gap-3">
        {name === null ? (
          <h2 className="text-lg font-semibold">{d.name}</h2>
        ) : (
          <Input
            aria-label="List name"
            className="w-64"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void rename()}
            onKeyDown={(e) => e.key === "Enter" && void rename()}
          />
        )}
        <span className="text-sm tabular-nums text-muted-foreground">
          {d.count.toLocaleString()} {what(d.count)}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {d.kind === "company" && (
            <ManagerOnly>
              <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                <Plus /> Add companies
              </Button>
            </ManagerOnly>
          )}
          {name === null && (
            <ManagerOnly>
              <Button variant="ghost" size="sm" onClick={() => setName(d.name)}>
                Rename
              </Button>
            </ManagerOnly>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv(wsId, `/smart-lists/${id}/export.csv`, `${slug}.csv`).catch((e) => toast.error(errorText(e)))}
          >
            <Download /> Download CSV
          </Button>
          <ManagerOnly>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete list
            </Button>
          </ManagerOnly>
        </div>
      </div>
      {adding && d.kind === "company" && (
        <AddCompaniesDialog
          wsId={wsId}
          listId={id}
          listName={d.name}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false)
            list.reload()
            onChanged()
          }}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${d.name}?`}
        description={`Its ${d.count.toLocaleString()} ${what(d.count)} are kept, back in "not in a list", and sorting can put them in another list.${d.leadIntelIcpId ? " The ICP created from it stays." : ""}`}
        confirmLabel="Delete list"
        destructive
        onConfirm={async () => {
          try {
            await deleteSmartList(wsId, id)
            toast.success(`Deleted ${d.name}`)
            onDeleted()
          } catch (e) {
            toast.error("Couldn't delete it", { description: errorText(e) })
          }
        }}
      />

      {d.kind === "company" && <IcpDraftPanel wsId={wsId} list={d} onChanged={() => (list.reload(), onChanged())} />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search this list"
            className="pl-8"
            placeholder={d.kind === "company" ? "Search companies or websites" : "Search name, title, company or email"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {q && (
          <span className="text-sm tabular-nums text-muted-foreground">
            {d.matching.toLocaleString()} {d.matching === 1 ? "match" : "matches"}
          </span>
        )}
        {d.matching > d.pageSize && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="tabular-nums text-muted-foreground">
              {first.toLocaleString()}–{last.toLocaleString()} of {d.matching.toLocaleString()}
            </span>
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <span className="tabular-nums">
              {page} / {pages}
            </span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>

      {picked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium tabular-nums">
            {picked.size} {what(picked.size)} selected
          </span>
          <Select value={target} onValueChange={setTarget} disabled={!manager}>
            <SelectTrigger className="h-8 w-52" aria-label="Move to list">
              <SelectValue placeholder="Move to…" />
            </SelectTrigger>
            <SelectContent>
              {others.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name} ({l.count})
                </SelectItem>
              ))}
              <SelectItem value={NEW_LIST}>A new list…</SelectItem>
            </SelectContent>
          </Select>
          {target === NEW_LIST && (
            <Input
              aria-label="New list name"
              className="h-8 w-48"
              placeholder="List name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          )}
          <ManagerOnly>
            <Button size="sm" disabled={moving || !target || (target === NEW_LIST && !newName.trim())} onClick={() => void move()}>
              {moving ? "Moving…" : "Move"}
            </Button>
          </ManagerOnly>
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-8 py-2 pr-2">
                <Checkbox aria-label="Select this page" checked={allPicked} onCheckedChange={togglePage} />
              </th>
              {d.kind === "company" ? (
                <>
                  <th className="py-2 pr-3 font-medium">Company</th>
                  <th className="py-2 pr-3 font-medium">Where</th>
                  <th className="py-2 pr-3 font-medium">Why this list</th>
                </>
              ) : (
                <>
                  <th className="py-2 pr-3 font-medium">Person</th>
                  <th className="py-2 pr-3 font-medium">Company</th>
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Why this list</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {d.companies.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="py-2 pr-2">
                  <Checkbox aria-label={`Select ${c.name}`} checked={picked.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                </td>
                <td className="py-2 pr-3">
                  <Link href={`/companies/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                  {c.domain && <div className="text-xs text-muted-foreground">{c.domain}</div>}
                </td>
                <td className="py-2 pr-3 text-muted-foreground">{[c.city, c.state].filter(Boolean).join(", ")}</td>
                <td className="py-2 pr-3 text-muted-foreground">{c.reason}</td>
              </tr>
            ))}
            {d.people.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="py-2 pr-2">
                  <Checkbox aria-label={`Select ${p.name}`} checked={picked.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                </td>
                <td className="py-2 pr-3">
                  <Link href={`/people/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                  <div className="text-xs text-muted-foreground">{p.title}</div>
                </td>
                <td className="py-2 pr-3 text-muted-foreground">{p.company}</td>
                <td className="py-2 pr-3 text-muted-foreground">{p.email ?? "No email"}</td>
                <td className="py-2 pr-3 text-muted-foreground">{p.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">{q ? "Nothing matches." : "This list is empty."}</p>
        )}
      </div>

      <Pager
        page={page}
        pageSize={pageSize}
        total={d.matching}
        onPage={setPage}
        onPageSize={(n) => {
          setPageSize(n)
          setPage(1)
        }}
      />
    </section>
  )
}



function AddCompaniesDialog({ wsId, listId, listName, onClose, onAdded }: {
  wsId: string
  listId: string
  listName: string
  onClose: () => void
  onAdded: () => void
}) {
  const companies = useApi(() => fetchPipeline(wsId), [wsId])
  const icps = useApi(() => fetchIcps(wsId), [wsId])
  const [icpFilter, setIcpFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const query = search.trim().toLowerCase()
  const matches = (companies.data ?? []).filter((c) =>
    (icpFilter === "all" || (icpFilter === "none" ? !c.icpId : c.icpId === icpFilter)) &&
    [c.name, c.domain, c.city, c.state].some((v) => v?.toLowerCase().includes(query)),
  )
  const [pageSize, setPageSize] = useState(25)
  const visible = matches.slice((page - 1) * pageSize, page * pageSize)
  const add = async () => {
    if (busy || !picked.size) return
    setBusy(true)
    try {
      const result = await moveToSmartList(wsId, "company", [...picked], { listId })
      toast.success(`Added ${result.moved} companies to ${listName}`)
      onAdded()
    } catch (e) {
      toast.error("Couldn't add companies", { description: errorText(e) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add companies to {listName}</DialogTitle>
          <DialogDescription>
            Choose workspace companies. Companies in another list move here; companies already here stay here. Their ICP stays the same.
          </DialogDescription>
        </DialogHeader>
        <Input aria-label="Search workspace companies" placeholder="Search companies, websites or locations" value={search}
          disabled={busy} onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        <Select value={icpFilter} disabled={busy} onValueChange={(value) => { setIcpFilter(value); setPage(1) }}>
          <SelectTrigger className="w-full" aria-label="Filter companies by ICP">
            <SelectValue placeholder="All ICPs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ICPs</SelectItem>
            <SelectItem value="none">No ICP</SelectItem>
            {(icps.data ?? []).map((icp) => (
              <SelectItem key={icp.id} value={icp.id}>{icp.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {icps.error && <div role="alert" className="text-sm">
          <p>Could not load ICP filters: {icps.error}</p>
          <Button variant="outline" size="sm" onClick={icps.reload}>Retry ICPs</Button>
        </div>}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            aria-label="Select all matching companies"
            disabled={busy || !matches.length || !!companies.error}
            checked={matches.length > 0 && matches.every((c) => picked.has(c.id))
              ? true : matches.some((c) => picked.has(c.id)) ? "indeterminate" : false}
            onCheckedChange={(checked) => {
              setPicked((current) => {
                const next = new Set(current)
                for (const c of matches) {
                  if (checked === true) next.add(c.id)
                  else next.delete(c.id)
                }
                return next
              })
            }}
          />
          Select all matching companies ({matches.length})
        </label>
        {picked.size > 0 && <div className="flex items-center justify-between text-sm">
          <span>{picked.size} selected across all filters</span>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setPicked(new Set())}>Clear selection</Button>
        </div>}
        {companies.error ? (
          <div role="alert" className="space-y-2 text-sm">
            <p>{companies.error}</p>
            <Button variant="outline" onClick={companies.reload}>Try again</Button>
          </div>
        ) : !companies.data ? <p className="text-sm">Loading companies...</p> : (
          <div className="max-h-80 overflow-y-auto">
            {visible.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-3 border-b py-3 text-sm">
                <Checkbox checked={picked.has(c.id)} disabled={busy} onCheckedChange={(checked) => {
                  setPicked((current) => {
                    const next = new Set(current)
                    if (checked) next.add(c.id)
                    else next.delete(c.id)
                    return next
                  })
                }} />
                <span><span className="font-medium">{c.name}</span>
                  <span className="block text-xs text-muted-foreground">{[c.domain, c.city, c.state].filter(Boolean).join(", ")}</span>
                </span>
              </label>
            ))}
            {!matches.length && <p className="py-4 text-sm text-muted-foreground">{query || icpFilter !== "all" ? "No matching companies." : "No workspace companies yet. Find companies on the Companies page first."}</p>}
          </div>
        )}
        <Pager page={page} pageSize={pageSize} total={matches.length} onPage={setPage}
          onPageSize={(size) => { setPageSize(size); setPage(1) }} />
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !picked.size || !companies.data || !!companies.error} onClick={() => void add()}>
            {busy ? "Adding..." : `Add selected (${picked.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
