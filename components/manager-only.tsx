"use client"

import { cloneElement, type ReactElement } from "react"
import { useAuth } from "@/lib/auth"
import { MANAGERS_ONLY_HINT, canManage, canRun } from "@/lib/roles"

/** A Management-only button: for Sales it's disabled, and hovering says why (the backend refuses it anyway). */
export function ManagerOnly({ children, runner = false }: { children: ReactElement<{ disabled?: boolean }>; runner?: boolean }) {
  const { me } = useAuth()
  // runner: a Quick Start run's own controls, which a Prospector has on their runs too.
  if (runner ? canRun(me?.role) : canManage(me?.role)) return children
  // A Prospector never has Management's controls: they aren't shown at all (Sales sees them greyed out, with why).
  if (me?.role === "prospector") return null
  return (
    <span title={MANAGERS_ONLY_HINT} className="inline-flex">
      {cloneElement(children, { disabled: true })}
    </span>
  )
}
