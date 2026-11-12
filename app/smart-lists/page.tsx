"use client"

import { FacetFilters, type FacetField } from "@/components/facet-filters"
import { presenceMatches, textMatches, PRESENCE_OPTIONS } from "@/lib/facets"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
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
  createSmartList, deleteSmartList, downloadCsv, draftSmartListIcp, fetchIcps, fetchSmartList, fetchSmartLists, moveToSmartList, renameSmartList, sortSmartLists,
  useApi, type MemberFacet, type SmartList, type SmartListKind,
} from "@/lib/api" // prettier-ignore
import { useAuth } from "@/lib/auth"
import { type CandidateFilters, fetchCandidateIds, fetchCandidates } from "@/lib/lists"
import { useDebounced } from "@/lib/use-debounced"
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
  const [extra, setExtra] = useState<Record<string,string>>({})
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
  const matchingLists = all.filter((list)=>textMatches(extra.query,list.name,list.icpDraft?.name) &&
    presenceMatches(list.leadIntelIcpId,extra.icp) && presenceMatches(list.icpDraft,extra.draft) && presenceMatches(list.count,extra.members))
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
            setExtra({})
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

      <Input aria-label="Search smart lists" placeholder="Search list name or draft ICP" value={extra.query ?? ""} onChange={(e)=>setExtra({...extra,query:e.target.value})} />
      <FacetFilters values={extra} onChange={setExtra} count={matchingLists.length} fields={[{key:"members",label:"List members",options:PRESENCE_OPTIONS},...(kind === "company" ? [{key:"icp",label:"Linked ICP",options:PRESENCE_OPTIONS},{key:"draft",label:"Draft ICP",options:PRESENCE_OPTIONS}] : [])]} />
      {lists.data && matchingLists.length === 0 ? (
        <EmptyState
          icon={ListTree}
          title={all.length ? "No matching smart lists" : "No smart lists yet"}
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
            {matchingLists.map((l) => (
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
  const [filters, setFilters] = useState<Record<string, string>>({})
  const facetKey = JSON.stringify(filters)
  const filtering = Object.values(filters).some((v) => v === "yes" || v === "no")
  const list = useApi(() => fetchSmartList(wsId, id, page, pageSize, q, filters), [wsId, id, page, pageSize, q, facetKey])
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
          <ManagerOnly>
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus /> Add {d.kind === "company" ? "companies" : "people"}
            </Button>
          </ManagerOnly>
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
      {adding && (
        <AddMembersDialog
          wsId={wsId}
          kind={d.kind}
          listId={id}
          listName={d.name}
          lists={lists}
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
        <FacetFilters
          label="Filters"
          values={filters}
          count={d.matching}
          onChange={(v) => {
            setFilters(v)
            setPage(1)
            setPicked(new Set())
          }}
          fields={memberFacetFields(d.kind)}
        />
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
                  <th className="py-2 pr-3 font-medium">People with emails</th>
                  <th className="py-2 pr-3 font-medium">Written to</th>
                  <th className="py-2 pr-3 font-medium">Why this list</th>
                </>
              ) : (
                <>
                  <th className="py-2 pr-3 font-medium">Person</th>
                  <th className="py-2 pr-3 font-medium">Company</th>
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Written to</th>
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
                <td className="py-2 pr-3 tabular-nums text-muted-foreground">{c.peopleWithEmail || "None"}</td>
                <td className="py-2 pr-3 text-muted-foreground">{c.processed ? "Yes" : "Not yet"}</td>
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
                <td className="py-2 pr-3 text-muted-foreground">{p.processed ? "Yes" : "Not yet"}</td>
                <td className="py-2 pr-3 text-muted-foreground">{p.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">{q || filtering ? "Nothing matches. Clear the search or filters to see more." : "This list is empty."}</p>
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

/** Written to: an email was already written to them (for a company, anyone at it); Quick Start skips those. */
const WRITTEN_OPTIONS = [
  { value: "no", label: "Not yet" },
  { value: "yes", label: "Already written to" },
]

/** Sent or queued: an email of theirs was queued or sent, or their address ever queued; the queue won't take them again. */
const CONTACTED_OPTIONS = [
  { value: "no", label: "Not yet" },
  { value: "yes", label: "Sent or queued" },
]

/** The yes/no filters on companies or people, used together (for a company, true of anyone at it). */
const memberFacetFields = (kind: SmartListKind): (FacetField & { key: MemberFacet })[] => [
  { key: "contacted", label: "Sent or queued", options: CONTACTED_OPTIONS },
  { key: "processed", label: "Written to", options: WRITTEN_OPTIONS },
  { key: "verified", label: kind === "company" ? "People with verified emails" : "Verified email", options: PRESENCE_OPTIONS },
  { key: "emails", label: kind === "company" ? "People with emails" : "Email", options: PRESENCE_OPTIONS },
]


/** Add companies or people to a list. Each row says which list it's in now; those already in this list aren't
 * offered. The box at the top selects only the rows on screen; "Select all" takes every match. */
function AddMembersDialog({
  wsId,
  kind,
  listId,
  listName,
  lists,
  onClose,
  onAdded,
}: {
  wsId: string
  kind: SmartListKind
  listId: string
  listName: string
  lists: SmartList[]
  onClose: () => void
  onAdded: () => void
}) {
  const noun = kind === "company" ? { one: "company", many: "companies" } : { one: "person", many: "people" }
  const [facets, setFacets] = useState<Record<string, string>>({})
  const facetsOn = Object.entries(facets).filter(([, v]) => v === "yes" || v === "no")
  const icps = useApi(() => fetchIcps(wsId), [wsId])
  const listName_ = new Map(lists.map((l) => [l.id, l.name]))
  const [search, setSearch] = useState("")
  const [icpFilter, setIcpFilter] = useState("all")
  const [from, setFrom] = useState("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  // Picked ids, each with the list they're in now (to say how many will move).
  const [picked, setPicked] = useState<Map<string, string | null>>(new Map())
  const [busy, setBusy] = useState(false)

  // The server filters and pages the candidates; typing waits for a pause before it asks.
  const typed = useDebounced(search)
  const query = typed.trim().toLowerCase()
  const filters: CandidateFilters = useMemo(() => ({
    kind, listId, icp: icpFilter, from, q: typed, processed: facets.processed, contacted: facets.contacted, verified: facets.verified,
    emails: facets.emails,
  }), [kind, listId, icpFilter, from, typed, facets.processed, facets.contacted, facets.verified, facets.emails])  // prettier-ignore
  const candidates = useApi(() => fetchCandidates(wsId, filters, page, pageSize), [wsId, filters, page, pageSize])
  const total = candidates.data?.total ?? 0
  const visible = candidates.data?.items ?? []
  const inList = (id: string) => visible.find((c) => c.id === id)?.listId ?? null
  const pageState = visible.length && visible.every((c) => picked.has(c.id)) ? true : visible.some((c) => picked.has(c.id)) ? "indeterminate" : false
  const allPicked = total > 0 && picked.size >= total && visible.every((c) => picked.has(c.id))
  const moving = [...picked.values()].filter(Boolean).length
  const loading = !candidates.data
  const error = candidates.error

  const toggle = (rows: { id: string; listId: string | null }[], on: boolean) =>
    setPicked((current) => {
      const next = new Map(current)
      for (const row of rows) {
        if (on) next.set(row.id, row.listId)
        else next.delete(row.id)
      }
      return next
    })
  const pickAll = async () => {
    try {
      toggle(await fetchCandidateIds(wsId, filters), true)
    } catch (e) {
      toast.error(`Couldn't select them all`, { description: errorText(e) })
    }
  }
  const filter = (set: (v: string) => void) => (v: string) => {
    set(v)
    setPage(1)
  }

  const add = async () => {
    if (busy || !picked.size) return
    setBusy(true)
    try {
      const r = await moveToSmartList(wsId, kind, [...picked.keys()], { listId })
      toast.success(`Added ${r.moved.toLocaleString()} ${r.moved === 1 ? noun.one : noun.many} to ${listName}`)
      onAdded()
    } catch (e) {
      toast.error(`Couldn't add the ${noun.many}`, { description: errorText(e) })
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="gap-4 sm:max-w-2xl!">
        <DialogHeader>
          <DialogTitle>Add {noun.many} to {listName}</DialogTitle>
          <DialogDescription>
            Those in another list move here. Their ICP doesn&apos;t change.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={`Search ${noun.many}`}
              className="pl-8"
              placeholder={kind === "company" ? "Search names, websites, places" : "Search names, titles, companies, emails"}
              value={search}
              disabled={busy}
              onChange={(e) => filter(setSearch)(e.target.value)}
            />
          </div>
          <Select value={from} disabled={busy} onValueChange={filter(setFrom)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Which list they're in now">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">In any list</SelectItem>
              <SelectItem value="none">Not in a list</SelectItem>
              {lists
                .filter((l) => l.id !== listId)
                .map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    In {l.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={icpFilter} disabled={busy} onValueChange={filter(setIcpFilter)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Filter by ICP">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any ICP</SelectItem>
              <SelectItem value="none">No ICP</SelectItem>
              {(icps.data ?? []).map((icp) => (
                <SelectItem key={icp.id} value={icp.id}>
                  {icp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="-mt-2 flex flex-wrap items-center gap-2">
          <FacetFilters label="Filters" values={facets} onChange={(v) => (setFacets(v), setPage(1))} count={total}
            fields={memberFacetFields(kind)} />
        </div>

        <div className="overflow-hidden rounded-md border">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/40 px-3 py-2 text-sm">
            <Checkbox
              aria-label={`Select the ${visible.length} on this page`}
              disabled={busy || loading || !visible.length}
              checked={pageState}
              onCheckedChange={(v) => toggle(visible, v === true)}
            />
            <span className="tabular-nums">
              {picked.size ? `${picked.size.toLocaleString()} selected` : `${total.toLocaleString()} ${total === 1 ? noun.one : noun.many}`}
            </span>
            <span className="ml-auto flex items-center gap-1">
              {total > visible.length && !allPicked && (
                <Button variant="ghost" size="sm" className="h-7" disabled={busy} onClick={() => void pickAll()}>
                  Select all {total.toLocaleString()}
                </Button>
              )}
              {picked.size > 0 && (
                <Button variant="ghost" size="sm" className="h-7" disabled={busy} onClick={() => setPicked(new Map())}>
                  Clear
                </Button>
              )}
            </span>
          </div>
          {error ? (
            <div role="alert" className="space-y-2 p-4 text-sm">
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={() => candidates.reload()}>
                Try again
              </Button>
            </div>
          ) : loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading {noun.many}…</p>
          ) : !total ? (
            <p className="p-4 text-sm text-muted-foreground">
              {query || icpFilter !== "all" || from !== "all" || facetsOn.length ? `No ${noun.many} match.` : `Every ${noun.one} is already in ${listName}.`}
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-rule overflow-y-auto">
              {visible.map((c) => {
                const current = inList(c.id)
                return (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/50">
                      <Checkbox checked={picked.has(c.id)} disabled={busy} onCheckedChange={(v) => toggle([c], v === true)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{c.name}</span>
                        {c.detail && <span className="block truncate text-xs text-muted-foreground">{c.detail}</span>}
                      </span>
                      <span className={cn("max-w-40 flex-none truncate text-xs", current ? "text-muted-foreground" : "text-foreground")}>
                        {current ? `In ${listName_.get(current) ?? "another list"}` : "Not in a list"}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <Pager
          page={page}
          pageSize={pageSize}
          total={total}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size)
            setPage(1)
          }}
        />
        <DialogFooter className="items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {moving ? `${moving.toLocaleString()} of them will leave the list they're in now.` : ""}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={busy || !picked.size} onClick={() => void add()}>
              {busy ? "Adding…" : picked.size ? `Add ${picked.size.toLocaleString()}` : "Add"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
