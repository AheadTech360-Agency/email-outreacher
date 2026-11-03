"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import type { ReactNode } from "react"
import { ChevronRight, ExternalLink, Mail, Newspaper, UserRound } from "lucide-react"
import { BackendError, WorkspaceGate } from "@/components/companies/backend-state"
import { PageHeader } from "@/components/page-header"
import { Pill } from "@/components/status"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchCompanyContent, fetchEmails, fetchPipelineCompany, fetchPosts, fetchStakeholder, useApi } from "@/lib/api"
import { shortDate } from "@/lib/format"

const FOUND_BY: Record<string, string> = { apollo: "Apollo", apify_linkedin: "LinkedIn", manual: "Added by hand or CSV" }
const EMAIL_STATUS: Record<string, string> = { draft: "To review", edited: "Edited", approved: "Approved", queued: "Queued", sent: "Sent", skipped: "Skipped" }

export default function PersonPage() {
  const { id } = useParams<{ id: string }>()
  return <WorkspaceGate>{(wsId) => <Person key={`${wsId}-${id}`} wsId={wsId} id={id} />}</WorkspaceGate>
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Mail; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Icon className="size-4 text-muted-foreground" /> {title}
      </h2>
      {children}
    </section>
  )
}

function Person({ wsId, id }: { wsId: string; id: string }) {
  const person = useApi(() => fetchStakeholder(wsId, id), [wsId, id])
  const p = person.data
  const companyId = p?.pipelineCompanyId ?? null
  const leadId = p?.leadId ?? null
  const company = useApi(() => (companyId ? fetchPipelineCompany(wsId, companyId) : Promise.resolve(null)), [wsId, companyId])
  const content = useApi(() => (companyId ? fetchCompanyContent(wsId, companyId) : Promise.resolve(null)), [wsId, companyId])
  const own = useApi(() => (leadId ? fetchPosts(wsId, leadId) : Promise.resolve([])), [wsId, leadId])
  const emails = useApi(() => (leadId ? fetchEmails(wsId) : Promise.resolve([])), [wsId, leadId])

  if (person.error && !p)
    return (
      <div className="px-4 pt-6 md:px-8">
        <BackendError message={person.error} onRetry={person.reload} />
      </div>
    )
  if (!p)
    return (
      <div className="space-y-4 px-4 pt-6 md:px-8">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-60 w-full" />
      </div>
    )

  const name = `${p.firstName} ${p.lastName}`.trim() || p.email || "Unnamed"
  const companyName = company.data?.name ?? p.organizationName
  const posts = [
    ...(own.data ?? []).map((x) => ({ ...x, whose: "Their own" })),
    ...(content.data?.posts ?? []).map((x) => ({ ...x, whose: "Company" })),
  ].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""))
  const theirEmails = (emails.data ?? []).filter((e) => e.lead.id === leadId)

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 px-4 pt-5 text-[13px] text-muted-foreground md:px-8 md:pt-6">
        <Link href="/people" className="hover:text-foreground">
          People
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="truncate">{name}</span>
      </nav>
      <div className="-mt-4 md:-mt-5">
        <PageHeader title={name} description={[p.title, companyName].filter(Boolean).join(" at ")} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 px-4 pb-10 md:px-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Section title="Who they are" icon={UserRound}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Company</dt>
            <dd>
              {companyId ? (
                <Link href={`/companies/${companyId}`} className="font-medium hover:underline">
                  {companyName}
                </Link>
              ) : (
                (companyName ?? "Not known")
              )}
            </dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd>
              {p.email ?? "None yet"}
              {p.emailStatus && <span className="ml-1.5 text-xs text-muted-foreground">({p.emailStatus})</span>}
            </dd>
            <dt className="text-muted-foreground">LinkedIn</dt>
            <dd>
              {p.linkedinUrl ? (
                <a href={p.linkedinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                  Profile <ExternalLink className="size-3" />
                </a>
              ) : (
                "None"
              )}
            </dd>
            {p.seniority && (
              <>
                <dt className="text-muted-foreground">Seniority</dt>
                <dd className="capitalize">{p.seniority.replaceAll("_", " ")}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Found by</dt>
            <dd>
              {p.emailStatus === "website" ? "Their company's website" : (FOUND_BY[p.source] ?? p.source)}, {shortDate(p.foundAt)}
            </dd>
            <dt className="text-muted-foreground">Lead</dt>
            <dd>
              {p.queuedAt ? (
                <Pill tone="positive">Lead since {shortDate(p.queuedAt)}</Pill>
              ) : (
                <span className="text-muted-foreground">Not yet: becomes one when their email is queued</span>
              )}
            </dd>
          </dl>
        </Section>

        <Section title={`Emails (${theirEmails.length})`} icon={Mail}>
          {!leadId || theirEmails.length === 0 ? (
            <p className="text-sm text-muted-foreground">None written yet. Select them on People and choose Write emails.</p>
          ) : (
            theirEmails.map((e) => (
              <div key={e.id} className="space-y-1.5 rounded-md border px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Pill tone={e.status === "queued" || e.status === "sent" ? "positive" : "info"}>{EMAIL_STATUS[e.status] ?? e.status}</Pill>
                  {e.score !== null && <span>Score {e.score}</span>}
                  <span>{shortDate(e.createdAt)}</span>
                  {(e.status === "draft" || e.status === "edited") && (
                    <Link href="/review" className="underline">
                      Review it
                    </Link>
                  )}
                </div>
                <p className="text-sm font-medium">{e.subject}</p>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{e.body}</p>
              </div>
            ))
          )}
        </Section>

        <Section title={`Posts (${posts.length})`} icon={Newspaper}>
          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No posts yet. Fetch posts on People reads the company&apos;s LinkedIn, their own, then the company&apos;s Instagram.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {posts.slice(0, 20).map((x) => (
                <li key={x.id} className="text-sm">
                  <a href={x.url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline">
                    {x.whose} · {x.source === "linkedin" ? "LinkedIn" : "Instagram"} · {x.postedAt ? shortDate(x.postedAt) : "Undated"}
                  </a>
                  <p className="line-clamp-4 whitespace-pre-wrap">{x.text || "No text"}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  )
}
