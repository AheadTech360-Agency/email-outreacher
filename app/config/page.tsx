"use client"

import Link from "next/link"
import { CircleAlert, Mailbox, Plus } from "lucide-react"
import { CapacityRail } from "@/components/config/capacity-rail"
import { LoadError } from "@/components/config/load-error"
import { SenderStatusPill } from "@/components/config/sender-status"
import { Page } from "@/components/config/shell"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { canManage, fetchPersonas, fetchSenders, useApi } from "@/lib/config-api"
import { useSession } from "@/lib/config-session"

export default function OverviewPage() {
  const { workspaceId, me, href: at } = useSession()
  const senders = useApi(() => (workspaceId ? fetchSenders(workspaceId) : Promise.resolve([])), [workspaceId])
  const personas = useApi(() => (workspaceId ? fetchPersonas(workspaceId) : Promise.resolve([])), [workspaceId])
  // Campaign capacity: sending mailboxes only (warming ones only warm up).
  const list = (senders.data ?? []).filter((s) => s.pool === "sending")
  const attention = list.filter((s) => s.status === "failed" || s.status === "untested")
  const manager = canManage(me?.role)

  return (
    <Page title="Overview" description="How much the team can send today, and which mailboxes need a look.">
      {senders.error && !senders.data ? (
        <LoadError message={senders.error} onRetry={senders.reload} />
      ) : !senders.data ? (
        <div className="space-y-4">
          <Skeleton className="h-[244px] w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : list.length === 0 ? (
        <section className="rounded-xl border bg-card px-6 py-14 text-center">
          <Mailbox className="mx-auto size-8 text-data" aria-hidden />
          <h2 className="mt-4 text-[17px] font-semibold">Add your first mailbox</h2>
          <p className="mx-auto mt-1.5 max-w-[46ch] text-[13.5px] text-muted-foreground">
            Coldbrew sends from the mailboxes you add here and reads their replies. You&apos;ll need each one&apos;s address and an app password.
          </p>
          {manager ? (
            <Button asChild className="mt-6">
              <Link href={`${at("/senders")}?add=1`}>
                <Plus /> Add a mailbox
              </Link>
            </Button>
          ) : (
            <p className="mt-6 text-[13px] text-muted-foreground">Ask Management or an admin to add one.</p>
          )}
        </section>
      ) : (
        <div className="min-w-0 space-y-6">
          <CapacityRail senders={list} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] [&>*]:min-w-0">
            <section aria-labelledby="attention-title" className="rounded-xl border bg-card">
              <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
                <h2 id="attention-title" className="text-[14px] font-semibold">
                  Needs a look
                </h2>
                <Link href={at("/senders")} className="text-[13px] text-muted-foreground hover:text-foreground hover:underline">
                  All mailboxes
                </Link>
              </div>
              {attention.length === 0 ? (
                <p className="px-5 py-6 text-[13.5px] text-muted-foreground">Every mailbox is connected.</p>
              ) : (
                <ul className="divide-y divide-rule">
                  {attention.map((s) => (
                    <li key={s.id} className="flex items-start gap-3 px-5 py-3.5">
                      <CircleAlert className={s.status === "failed" ? "mt-0.5 size-4 flex-none text-negative" : "mt-0.5 size-4 flex-none text-warning"} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">{s.fromEmail}</p>
                        <p className="text-[12.5px] leading-[18px] text-muted-foreground">
                          {s.status === "failed" ? (s.lastError ?? "The last check failed.") : "Added but not tested yet. Test it before Coldbrew sends from it."}
                        </p>
                      </div>
                      <SenderStatusPill status={s.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="setup-title" className="rounded-xl border bg-card px-5 py-4">
              <h2 id="setup-title" className="text-[14px] font-semibold">
                This workspace
              </h2>
              <dl className="mt-3 divide-y divide-rule text-[13.5px]">
                <Row label="Sending mailboxes" value={list.length} href={at("/senders")} />
                <Row label="Warming mailboxes" value={(senders.data ?? []).filter((s) => s.pool === "warming").length} href={at("/warming")} />
                <Row label="Connected" value={list.filter((s) => s.status === "ok").length} />
                <Row label="Reading replies" value={list.filter((s) => s.imapHost).length} />
                <Row label="Personas" value={personas.data?.length ?? "…"} href={at("/personas")} />
              </dl>
            </section>
          </div>
        </div>
      )}
    </Page>
  )
}

function Row({ label, value, href }: { label: string; value: number | string; href?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-muted-foreground">{href ? <Link href={href} className="hover:text-foreground hover:underline">{label}</Link> : label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}
