"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { ChevronRight, Users } from "lucide-react"
import { toast } from "sonner"
import { BackendError, WorkspaceGate } from "@/components/companies/backend-state"
import { CompanyDetail } from "@/components/companies/company-detail"
import { FindStakeholdersDialog } from "@/components/companies/find-stakeholders-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { PageHeader } from "@/components/page-header"
import { Pill } from "@/components/status"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { decideCompanies, fetchAllStakeholders, fetchPipelineCompany, researchCompanies, useApi } from "@/lib/api"
import { formatUsd } from "@/lib/format"

const COST_PER_VERIFY = 0.004 // website (free), Instagram profile and Claude's score

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>()
  return <WorkspaceGate>{(wsId) => <Company key={`${wsId}-${id}`} wsId={wsId} id={id} />}</WorkspaceGate>
}

function Company({ wsId, id }: { wsId: string; id: string }) {
  const router = useRouter()
  const company = useApi(() => fetchPipelineCompany(wsId, id), [wsId, id])
  const people = useApi(() => fetchAllStakeholders(wsId), [wsId])
  const [busy, setBusy] = useState(false)
  const [finding, setFinding] = useState(false)
  const [reverifying, setReverifying] = useState(false)

  if (company.error && !company.data)
    return (
      <div className="px-4 pt-6 md:px-8">
        <BackendError message={company.error} onRetry={company.reload} />
      </div>
    )
  const c = company.data
  if (!c)
    return (
      <div className="space-y-4 px-4 pt-6 md:px-8">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-60 w-full" />
      </div>
    )

  const here = (people.data ?? []).filter((p) => p.pipelineCompanyId === c.id)
  const act = async (call: Promise<unknown>, done: string) => {
    setBusy(true)
    try {
      await call
      toast.success(done)
      company.reload()
    } catch (e) {
      toast.error("Couldn't do that", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 px-4 pt-5 text-[13px] text-muted-foreground md:px-8 md:pt-6">
        <Link href="/companies" className="hover:text-foreground">
          Companies
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="truncate">{c.name}</span>
      </nav>
      <div className="-mt-4 md:-mt-5">
        <PageHeader title={c.name} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 px-4 pb-10 md:px-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <CompanyDetail
          workspaceId={wsId}
          company={c}
          busy={busy}
          onStatus={(status) => void act(decideCompanies(wsId, [c.id], status), status === "qualified" ? "Approved" : "Rejected")}
          onFindStakeholders={() => setFinding(true)}
          onReverify={c.source !== "lead_intel" && c.researchedAt ? () => setReverifying(true) : undefined}
          onExcluded={() => router.push("/companies")}
        />

        <section className="space-y-3 rounded-lg border p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Users className="size-4 text-muted-foreground" /> People at {c.name} ({here.length})
          </h2>
          {people.loading && !people.data ? (
            <Skeleton className="h-24 w-full" />
          ) : here.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody found here yet.{c.status === "qualified" ? " Use Find stakeholders above." : " Approve it first, then find stakeholders."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Lead</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {here.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => router.push(`/people/${p.id}`)}>
                    <TableCell>
                      <div className="font-medium">{`${p.firstName} ${p.lastName}`.trim() || "Unnamed"}</div>
                      <div className="text-xs text-muted-foreground">{p.title}</div>
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">{p.email ?? "No email"}</TableCell>
                    <TableCell>{p.queuedAt ? <Pill tone="positive">Lead</Pill> : <span className="text-[13px] text-muted-foreground">Not yet</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </div>

      {finding && (
        <FindStakeholdersDialog
          workspaceId={wsId}
          companies={[c]}
          onClose={() => setFinding(false)}
          onDone={() => {
            people.reload()
            company.reload()
          }}
        />
      )}
      <ConfirmDialog
        open={reverifying}
        onOpenChange={setReverifying}
        title={`Verify ${c.name} again?`}
        description={`Reads the website again and scores with the current verification prompt. The new verdict replaces the old one, including one you set by hand. About ${formatUsd(COST_PER_VERIFY)}, logged on Usage.`}
        confirmLabel="Verify again"
        onConfirm={() => {
          setReverifying(false)
          void act(researchCompanies(wsId, [c.id], true), "Verified again")
        }}
      />
    </>
  )
}
