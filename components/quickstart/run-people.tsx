"use client"

import Link from "next/link"
import { useState } from "react"
import { ChevronDown, Download } from "lucide-react"
import { ColumnPicker, type ColumnDef, downloadRowsCsv, useColumns } from "@/components/column-picker"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { type QuickstartDetail, type QuickstartPerson, fetchQuickstartPeople, useApi } from "@/lib/api"
import { shortDate } from "@/lib/format"

const link = (href: string | null, label?: string) =>
  href ? (
    <a href={href} target="_blank" rel="noreferrer" className="hover:underline" onClick={(e) => e.stopPropagation()}>
      {label ?? href.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
    </a>
  ) : (
    <span className="text-muted-foreground">—</span>
  )
const plain = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? "" : String(v))
const SOURCE: Record<string, string> = { apify_linkedin: "LinkedIn", apollo: "Apollo", manual: "Added by hand", website: "Their website" }

/** Every column the table and its CSV can have. */
const COLUMNS: ColumnDef<QuickstartPerson>[] = [
  { key: "name", label: "Name", cell: (p) => <span className="font-medium">{`${p.firstName} ${p.lastName}`.trim() || "Unnamed"}</span>, text: (p) => `${p.firstName} ${p.lastName}`.trim() },
  { key: "firstName", label: "First name", cell: (p) => p.firstName, text: (p) => p.firstName },
  { key: "lastName", label: "Last name", cell: (p) => p.lastName, text: (p) => p.lastName },
  { key: "title", label: "Title", cell: (p) => p.title || "—", text: (p) => p.title },
  { key: "seniority", label: "Seniority", cell: (p) => p.seniority || "—", text: (p) => plain(p.seniority) },
  { key: "email", label: "Email", cell: (p) => p.email || <span className="text-muted-foreground">—</span>, text: (p) => plain(p.email) },
  { key: "emailStatus", label: "Email status", cell: (p) => p.emailStatus || "—", text: (p) => plain(p.emailStatus) },
  { key: "linkedin", label: "LinkedIn", cell: (p) => link(p.linkedinUrl, p.linkedinUrl ? "Profile" : undefined), text: (p) => plain(p.linkedinUrl) },
  {
    key: "company",
    label: "Company",
    cell: (p) =>
      p.companyId ? (
        <Link href={`/companies/${p.companyId}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
          {p.company}
        </Link>
      ) : (
        p.company
      ),
    text: (p) => p.company,
  },
  { key: "website", label: "Company website", cell: (p) => link(p.companyWebsite), text: (p) => plain(p.companyWebsite) },
  { key: "companyLinkedin", label: "Company LinkedIn", cell: (p) => link(p.companyLinkedin, p.companyLinkedin ? "Page" : undefined), text: (p) => plain(p.companyLinkedin) },
  { key: "instagram", label: "Instagram", cell: (p) => link(p.companyInstagram), text: (p) => plain(p.companyInstagram) },
  { key: "facebook", label: "Facebook", cell: (p) => link(p.companyFacebook), text: (p) => plain(p.companyFacebook) },
  { key: "phone", label: "Company phone", cell: (p) => p.companyPhone || "—", text: (p) => plain(p.companyPhone) },
  { key: "city", label: "City", cell: (p) => p.city || "—", text: (p) => plain(p.city) },
  { key: "state", label: "State", cell: (p) => p.state || "—", text: (p) => plain(p.state) },
  { key: "industry", label: "Industry", cell: (p) => p.industry || "—", text: (p) => plain(p.industry) },
  { key: "employees", label: "Employees", cell: (p) => p.employees ?? "—", text: (p) => plain(p.employees), className: "text-right tabular-nums" },
  { key: "companyStatus", label: "Company status", cell: (p) => p.companyStatus || "—", text: (p) => plain(p.companyStatus) },
  { key: "score", label: "Company score", cell: (p) => p.companyScore ?? "—", text: (p) => plain(p.companyScore), className: "text-right tabular-nums" },
  { key: "source", label: "Found by", cell: (p) => SOURCE[p.source] ?? p.source, text: (p) => SOURCE[p.source] ?? p.source },
  { key: "lead", label: "Lead", cell: (p) => (p.lead ? "Yes" : "No"), text: (p) => (p.lead ? "Yes" : "No") },
  { key: "found", label: "Found", cell: (p) => shortDate(p.foundAt), text: (p) => p.foundAt.slice(0, 10) },
]
const USUAL = ["name", "title", "email", "linkedin", "company", "website", "city", "state"]

/** Everyone a run found, as a table like a spreadsheet: pick the columns, pick rows, and download them as a CSV. */
export function RunPeople({ wsId, run }: { wsId: string; run: QuickstartDetail }) {
  // Reloaded as people come in (the people step's count changes while it runs).
  const people = useApi(() => fetchQuickstartPeople(wsId, run.id), [wsId, run.id, run.steps.people?.done ?? 0, run.status])
  const { visible, shown, toggle, reset } = useColumns("quickstart-people", COLUMNS, USUAL)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const rows = people.data ?? []
  if (!rows.length) return null
  const chosen = rows.filter((p) => picked.has(p.id))
  const all = rows.length > 0 && chosen.length === rows.length
  const slug = run.icpName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "people"
  const save = (which: QuickstartPerson[], columns: ColumnDef<QuickstartPerson>[]) =>
    downloadRowsCsv(`${slug}-people-${run.createdAt.slice(0, 10)}.csv`, which, columns)

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">People ({rows.length})</h2>
          <p className="text-sm text-muted-foreground">Everyone this run found, with their company. Pick the columns, then download them.</p>
        </div>
        <div className="flex gap-2">
          <ColumnPicker columns={COLUMNS} shown={shown} onToggle={toggle} onReset={reset} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Download /> Export CSV <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{chosen.length ? `${chosen.length} selected` : "Nobody selected"}</DropdownMenuLabel>
              <DropdownMenuItem disabled={!chosen.length} onSelect={() => save(chosen, visible)}>
                Selected, these columns
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!chosen.length} onSelect={() => save(chosen, COLUMNS)}>
                Selected, every column
              </DropdownMenuItem>
              <DropdownMenuLabel>Everyone ({rows.length})</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => save(rows, visible)}>Everyone, these columns</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => save(rows, COLUMNS)}>Everyone, every column</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table className="text-[13px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select everyone"
                  checked={all ? true : chosen.length ? "indeterminate" : false}
                  onCheckedChange={(v) => setPicked(v === true ? new Set(rows.map((p) => p.id)) : new Set())}
                />
              </TableHead>
              {visible.map((c) => (
                <TableHead key={c.key} className={`whitespace-nowrap ${c.className ?? ""}`}>
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id} data-state={picked.has(p.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    aria-label={`Select ${p.firstName} ${p.lastName}`.trim()}
                    checked={picked.has(p.id)}
                    onCheckedChange={(v) =>
                      setPicked((set) => {
                        const next = new Set(set)
                        if (v === true) next.add(p.id)
                        else next.delete(p.id)
                        return next
                      })
                    }
                  />
                </TableCell>
                {visible.map((c) => (
                  <TableCell key={c.key} className={`max-w-64 truncate whitespace-nowrap ${c.className ?? ""}`}>
                    {c.cell(p)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
