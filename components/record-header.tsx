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
  avatar,
}: {
  back: { href: string; label: string }
  title: string
  /** Shown left of the name. */
  avatar?: ReactNode
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
        <div className="flex min-w-0 items-center gap-4">
          {avatar}
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

/** Initials in a square, so a record has a face before anything else loads. */
export function Avatar({ name, round = false }: { name: string; round?: boolean }) {
  const initials =
    name
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  return (
    <span
      aria-hidden
      className={`flex size-12 flex-none items-center justify-center bg-primary/10 text-base font-semibold text-primary ${round ? "rounded-full" : "rounded-lg"}`}
    >
      {initials}
    </span>
  )
}

// Values that are lists ("Shopify, Hubspot, ..."): shown as chips.
const LISTS = new Set(["Keywords", "Technologies", "Lists"])

function Value({ label, value }: { label: string; value: string }) {
  if (LISTS.has(label)) {
    const items = value.split(",").map((v) => v.trim()).filter(Boolean)
    return (
      <span className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span key={item} className="rounded-md border bg-muted/40 px-1.5 py-0.5 text-xs">
            {item}
          </span>
        ))}
      </span>
    )
  }
  if (/^https?:\/\//.test(value))
    return (
      <a href={value} target="_blank" rel="noreferrer" className="text-data hover:underline">
        {value.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
      </a>
    )
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return <>{new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" })}</>
  if (/^\d{5,}$/.test(value) && /revenue|funding|amount/i.test(label)) return <>${Number(value).toLocaleString()}</>
  return <>{value}</>
}

/** One group of stored fields ({label: value}), as a two-column list. */
export function DataGroup({ title, values }: { title: string; values: Record<string, string> }) {
  const entries = Object.entries(values)
  if (!entries.length) return null
  // A group of one field named like the group (Technologies): just the value.
  if (entries.length === 1 && entries[0][0] === title)
    return (
      <Block title={title}>
        <div className="text-sm">
          <Value label={title} value={entries[0][1]} />
        </div>
      </Block>
    )
  return (
    <Block title={title}>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[10rem_1fr]">
        {entries.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words whitespace-pre-line">
              <Value label={label} value={value} />
            </dd>
          </div>
        ))}
      </dl>
    </Block>
  )
}

/** The side column of a record's overview: a quiet panel of the facts you'd look for first. */
export function Panel({ children }: { children: ReactNode }) {
  return <aside className="space-y-6 rounded-lg border bg-muted/30 p-5">{children}</aside>
}
