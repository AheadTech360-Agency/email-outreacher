"use client"

import Link from "next/link"
import { notFound, usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { BackendError } from "@/components/companies/backend-state"
import { IcpLifecycleActions } from "@/components/icp-lifecycle-actions"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { PipelineStrip } from "@/components/status"
import { useIcpParam } from "@/hooks/use-icp"
import { leadCount, pipelineOf } from "@/lib/selectors"
import { useLeadSummary } from "@/lib/lists"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

export default function IcpLayout({ children }: { children: ReactNode }) {
  const icp = useIcpParam()
  const pathname = usePathname()
  const { leadsVersion, currentWorkspaceId, icpsStatus, icpsError, reloadIcps } = useStore()
  // The ICP's leads per status, counted by the server.
  const summary = useLeadSummary(currentWorkspaceId, leadsVersion)

  // ICPs load from the backend; only call it missing once they have.
  if (!icp && icpsStatus === "error")
    return (
      <div className="px-4 pt-6 md:px-8">
        <BackendError message={icpsError ?? ""} onRetry={reloadIcps} />
      </div>
    )
  if (!icp && icpsStatus === "loading")
    return (
      <div className="space-y-4 px-4 pt-6 md:px-8">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  if (!icp) notFound()

  const statuses = summary.of(icp.id)
  const counts = pipelineOf(statuses)
  const base = `/icps/${icp.id}`
  const tabs = [
    { href: "", label: "Definition" },
    { href: "/prompts", label: "Prompts" },
    { href: "/leads", label: "Leads", count: leadCount(statuses), also: ["/import"] },
    { href: "/review", label: "Review", count: counts.review },
  ]

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 px-4 pt-5 text-[13px] text-muted-foreground md:px-8 md:pt-6">
        <Link href="/icps" className="hover:text-foreground">
          ICPs
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="truncate">{icp.name}</span>
      </nav>
      <div className="-mt-4 md:-mt-5">
        <PageHeader
          title={icp.name}
          description={`${icp.enabled ? "" : "Archived · "}${icp.description || `${icp.industry} · from Lead Intel`}`}
          actions={<IcpLifecycleActions icp={icp} />}
        >
          <PipelineStrip statuses={statuses} className="max-w-3xl" />
        </PageHeader>
      </div>
      <nav className="flex gap-6 overflow-x-auto overflow-y-hidden border-b px-4 md:px-8" aria-label="ICP sections">
        {tabs.map((tab) => {
          const href = base + tab.href
          const active =
            tab.href === ""
              ? pathname === base
              : pathname.startsWith(href) || (tab.also ?? []).some((p) => pathname.startsWith(base + p))
          return (
            <Link
              key={tab.label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 py-2.5 text-sm whitespace-nowrap transition-colors",
                active
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="rounded-[4px] bg-muted px-1.5 text-xs leading-5 font-normal text-muted-foreground tabular-nums">
                  {tab.count}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
      <div className="min-w-0 px-4 pt-6 pb-10 md:px-8">{children}</div>
    </>
  )
}
