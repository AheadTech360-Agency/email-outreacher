import { useEffect, useState } from "react"

/** The value once it has stopped changing for `ms`: a search box asks the server once per pause, not per key. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}

/** A selection that keeps what each picked row needs (id -> row), so bulk actions work across pages. */
export function pickRows<T extends { id: string }>(current: Map<string, T>, rows: T[], on: boolean): Map<string, T> {
  const next = new Map(current)
  for (const row of rows) {
    if (on) next.set(row.id, row)
    else next.delete(row.id)
  }
  return next
}
