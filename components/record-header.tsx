import Link from "next/link"
import type { ReactNode } from "react"
import { ChevronRight } from "lucide-react"

/** The top of a record page (Detail / Record pattern): where it sits, its name, its status and key facts on one
 * line, and its actions on the right. The facts stand in for a description. */
export function RecordHeader({
  back,
  title,
  facts,
  actions,
}: {
  back: { href: string; label: string }
  title: string
  /** Status first, then a few facts; empty ones are left out. */
  facts: ReactNode[]
  actions?: ReactNode
}) {
  const shown = facts.filter((f) => f !== null && f !== undefined && f !== false && f !== "")
  return (
    <header className="space-y-3 px-4 pt-5 pb-5 md:px-8 md:pt-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[13px] text-muted-foreground">
        <Link href={back.href} className="hover:text-foreground">
          {back.label}
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="truncate">{title}</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-1.5">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {shown.map((fact, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden>·</span>}
                {fact}
              </span>
            ))}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

/** A label and its value, in a two-column list of details. Empty values are left out. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "" || children === false) return null
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  )
}

/** A titled block inside a tab: a heading and its body, separated from the next by space, not boxes. */
export function Block({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}
