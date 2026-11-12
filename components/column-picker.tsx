"use client"

import { useState, type ReactNode } from "react"
import { Columns3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** A column a table can show: its header, what a cell shows, and the plain text a CSV gets. */
export interface ColumnDef<Row> {
  key: string
  label: string
  cell: (row: Row) => ReactNode
  text: (row: Row) => string
  className?: string
}

/** Which of these columns are shown, remembered per browser for this table (`storageKey`). */
export function useColumns<Row>(storageKey: string, columns: ColumnDef<Row>[], initial: string[]) {
  const [shown, setShown] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`columns:${storageKey}`) ?? "null")
      if (Array.isArray(saved)) return saved.filter((k) => columns.some((c) => c.key === k))
    } catch {
      // Storage can be unavailable or hold something old: the defaults then.
    }
    return initial
  })
  const set = (next: string[]) => {
    setShown(next)
    try {
      localStorage.setItem(`columns:${storageKey}`, JSON.stringify(next))
    } catch {
      // Not remembered this time; still shown.
    }
  }
  const toggle = (key: string, on: boolean) =>
    // Kept in the order the columns are defined, whichever order they're ticked in.
    set(columns.map((c) => c.key).filter((k) => (k === key ? on : shown.includes(k))))
  return { visible: columns.filter((c) => shown.includes(c.key)), shown, toggle, reset: () => set(initial) }
}

export function ColumnPicker<Row>({
  columns,
  shown,
  onToggle,
  onReset,
  label = "Columns",
}: {
  columns: ColumnDef<Row>[]
  shown: string[]
  onToggle: (key: string, on: boolean) => void
  onReset: () => void
  label?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Columns3 /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuLabel>Show these columns</DropdownMenuLabel>
        {columns.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.key}
            checked={shown.includes(c.key)}
            onCheckedChange={(v) => onToggle(c.key, v === true)}
            onSelect={(e) => e.preventDefault()}
          >
            {c.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onReset}>Back to the usual columns</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A CSV of these rows and columns, downloaded as `filename` (quoted where it needs to be; opens in Excel and Sheets). */
export function downloadRowsCsv<Row>(filename: string, rows: Row[], columns: ColumnDef<Row>[]) {
  const quote = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lines = [columns.map((c) => quote(c.label)).join(","), ...rows.map((r) => columns.map((c) => quote(c.text(r) ?? "")).join(","))]
  // A byte order mark, so Excel reads names with accents correctly.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
