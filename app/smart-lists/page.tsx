"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Download, ListTree, Search, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { WorkspaceGate } from "@/components/companies/backend-state"
import { EmptyState } from "@/components/empty-state"
import { ManagerOnly } from "@/components/manager-only"
import { PageHeader } from "@/components/page-header"
import { Pager } from "@/components/pager"
import { Pill } from "@/components/status"
import { TagInput } from "@/components/tag-input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  createIcpFromList, downloadCsv, draftSmartListIcp, fetchSmartList, fetchSmartLists, moveToSmartList, renameSmartList, sortSmartLists,
  useApi, type SmartList, type SmartListDetail, type SmartListIcpDraft, type SmartListKind,
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
        description="Companies and people grouped by Claude into broad lists: industries for companies, roles for people. Each company also goes under the ICP it fits; a list no ICP fits gets a draft ICP to create. Duplicates join their twin's list."
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
            <Button disabled={sorting || !unsorted} onClick={() => void sort()}>
              <Sparkles /> {sorting ? "Sorting…" : `Sort ${Math.min(unsorted, SORT_LIMIT)} ${what}`}
            </Button>
          </ManagerOnly>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Sorting uses Claude, about one call for every 25 {what}
        {kind === "company" && ", and reads the homepage of a company that hasn't been verified yet (plain request; sites that block it are skipped)"}
        . What it cost shows when it&apos;s done, and on Usage.
      </p>

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
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <ul className="space-y-1">
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
            <ListDetail key={openId} wsId={wsId} id={openId} lists={lists.data?.lists ?? []} onChanged={lists.reload} />
          ) : (
            <p className="text-sm text-muted-foreground">Pick a list to see who&apos;s in it.</p>
          )}
        </div>
      )}
    </div>
  )
}

const NEW_LIST = "__new__"

function ListDetail({
  wsId,
  id,
  lists,
  onChanged,
}: {
  wsId: string
  id: string
  lists: SmartList[]
  onChanged: () => void
}) {
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
        <div className="ml-auto flex gap-2">
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
        </div>
      </div>

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

const EMPTY_DRAFT: SmartListIcpDraft = { name: "", industry: "", description: "", searchTerms: [], anyOf: [], titles: [], places: [] }

function IcpDraftPanel({ wsId, list, onChanged }: { wsId: string; list: SmartListDetail; onChanged: () => void }) {
  const [draft, setDraft] = useState<SmartListIcpDraft | null>(list.icpDraft)
  const [busy, setBusy] = useState<"" | "draft" | "create">("")
  const set = <K extends keyof SmartListIcpDraft>(k: K, v: SmartListIcpDraft[K]) => setDraft((x) => ({ ...(x ?? EMPTY_DRAFT), [k]: v }))

  if (list.leadIntelIcpId)
    return (
      <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
        Its ICP is created.{" "}
        <Link href="/icps" className="underline">
          Open ICPs
        </Link>{" "}
        to add a product and run it.
      </p>
    )

  const makeDraft = async () => {
    setBusy("draft")
    try {
      const r = await draftSmartListIcp(wsId, list.id)
      setDraft(r.icpDraft)
      onChanged()
    } catch (e) {
      toast.error("Couldn't draft it", { description: errorText(e) })
    } finally {
      setBusy("")
    }
  }
  const create = async () => {
    if (!draft) return
    setBusy("create")
    try {
      await createIcpFromList(wsId, list.id, draft)
      toast.success(`ICP "${draft.name || list.name}" created`, { description: "Add a product to it on the ICPs page before running it." })
      onChanged()
    } catch (e) {
      toast.error("Couldn't create it", { description: errorText(e) })
    } finally {
      setBusy("")
    }
  }

  if (!draft)
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span>Turn this list into a base ICP: Claude drafts it from the companies in it, you edit it, then create it.</span>
        <ManagerOnly>
          <Button size="sm" variant="outline" disabled={!!busy || !list.count} onClick={() => void makeDraft()}>
            <Sparkles /> {busy === "draft" ? "Drafting…" : "Draft an ICP"}
          </Button>
        </ManagerOnly>
      </div>
    )

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Base ICP draft</h3>
        <ManagerOnly>
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void makeDraft()}>
            {busy === "draft" ? "Drafting…" : "Draft again"}
          </Button>
        </ManagerOnly>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="d-name">Name</Label>
          <Input id="d-name" value={draft.name} placeholder={list.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-industry">Industry</Label>
          <Input id="d-industry" value={draft.industry} placeholder={list.name} onChange={(e) => set("industry", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="d-description">Who they are</Label>
        <Textarea id="d-description" rows={2} value={draft.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="d-terms">Google Maps search terms</Label>
          <TagInput id="d-terms" value={draft.searchTerms} onChange={(v) => set("searchTerms", v)} placeholder="screen printing" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-words">Words that identify them</Label>
          <TagInput id="d-words" value={draft.anyOf} onChange={(v) => set("anyOf", v)} placeholder="custom apparel" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-titles">Job titles to reach</Label>
          <TagInput id="d-titles" value={draft.titles} onChange={(v) => set("titles", v)} placeholder="Owner" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-places">Places</Label>
          <TagInput places id="d-places" value={draft.places} onChange={(v) => set("places", v)} placeholder="Austin, TX" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Empty fields stay empty. You can fill them in later on the ICPs page.</p>
      <ManagerOnly>
        <Button disabled={!!busy} onClick={() => void create()}>
          {busy === "create" ? "Creating…" : "Create ICP"}
        </Button>
      </ManagerOnly>
    </div>
  )
}
