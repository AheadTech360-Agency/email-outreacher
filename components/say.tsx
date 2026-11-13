"use client"

import type { ReactNode } from "react"
import { useAuth } from "@/lib/auth"

/** Whether the signed-in person is a Prospector: their screens say what happened, never which tool or source did it. */
export function usePlain(): boolean {
  const { me } = useAuth()
  return me?.role === "prospector"
}

/** The team's wording, or a Prospector's: the same thing without the tools and sources behind it. */
export function Say({ team, plain }: { team: ReactNode; plain: ReactNode }) {
  return <>{usePlain() ? plain : team}</>
}
