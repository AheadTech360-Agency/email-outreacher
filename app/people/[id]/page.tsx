"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowRight, DatabaseZap, ExternalLink, Newspaper } from "lucide-react"
import { ArchiveRecordsButton } from "@/components/archive-records"
import { DeleteRecordsButton } from "@/components/delete-records-button"
import { BackendError, WorkspaceGate } from "@/components/companies/backend-state"
import { EnrichDialog } from "@/components/enrich-dialog"
import { ReadPostsDialog } from "@/components/read-posts-dialog"
import { ManagerOnly } from "@/components/manager-only"
import { StatusPill } from "@/components/companies/pipeline-cells"
import { PersonTimeline } from "@/components/people/person-timeline"
import { Avatar, Block, DataGroup, Fact, Panel, RecordHeader } from "@/components/record-header"
import { Pill, type PillTone } from "@/components/status"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fetchCompanyContent, fetchEmails, fetchPipelineCompany, fetchPosts, fetchStakeholder, useApi } from "@/lib/api"
import { shortDate } from "@/lib/format"

const SENIORITY: Record<string, string> = { vp: "VP", c_suite: "C-suite", owner: "Owner", founder: "Founder", head: "Head" }
const FOUND_BY: Record<string, string> ={ apollo: "Apollo", apify_linkedin: "LinkedIn", manual: "Added by hand or CSV" }
const EMAIL_STATUS: Record<string, { label: string; tone: PillTone }> = {
  draft: { label: "To review", tone: "info" },
  edited: { label: "Edited", tone: "info" },
  approved: { label: "Approved", tone: "positive" },
  queued: { label: "Queued", tone: "positive" },
  sent: { label: "Sent", tone: "positive" },
  skipped: { label: "Skipped", tone: "neutral" },
}
const ADDRESS: Record<string, { label: string; tone: PillTone }> = {
  verified: { label: "Verified", tone: "positive" },
  valid: { label: "Valid", tone: "positive" },
  risky: { label: "Risky", tone: "warning" },
  website: { label: "From their website", tone: "warning" },
}

export default function PersonPage() {
  const { id } = useParams<{ id: string }>()
  return <WorkspaceGate>{(wsId) => <Person key={`${wsId}-${id}`} wsId={wsId} id={id} />}</WorkspaceGate>
}

function Person({ wsId, id }: { wsId: string; id: string }) {
  const router = useRouter()
  const person = useApi(() => fetchStakeholder(wsId, id), [wsId, id])
  const [fillingIn, setFillingIn] = useState(false)
  const [readingPosts, setReadingPosts] = useState(false)
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
    ...(content.data?.posts ?? []).map((x) => ({ ...x, whose: "Their company's" })),
  ].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""))
  const theirEmails = (emails.data ?? []).filter((e) => e.lead.id === leadId)
  const address = p.emailStatus ? ADDRESS[p.emailStatus.toLowerCase()] : undefined
  const data = p.data ?? {}
  const about = company.data?.data?.About ?? {}

  return (
    <>
      <RecordHeader
        back={{ href: "/people", label: "People" }}
        title={name}
        avatar={<Avatar name={name} round />}
        facts={[
          p.queuedAt ? <Pill key="l" tone="positive">Lead</Pill> : <Pill key="l" tone="neutral">Not a lead yet</Pill>,
          p.title,
          companyId ? (
            <Link key="c" href={`/companies/${companyId}`} className="text-data hover:underline">
              {companyName}
            </Link>
          ) : (
            companyName
          ),
        ]}
        actions={
          <>
            <ArchiveRecordsButton workspaceId={wsId} kind="person" ids={[id]} restore={p.archived} onChanged={person.reload} />
            <DeleteRecordsButton workspaceId={wsId} kind="person" ids={[id]}
              onDeleted={() => router.push("/people")} />
            <ManagerOnly>
              <Button variant="outline" onClick={() => setReadingPosts(true)}>
                <Newspaper /> Read posts
              </Button>
            </ManagerOnly>
            {p.linkedinUrl && (
            <>
              <ManagerOnly>
                <Button variant="outline" onClick={() => setFillingIn(true)} title="Their full profile: about, experience, education, skills. $0.004.">
                  <DatabaseZap /> {data["LinkedIn profile"] ? "Read LinkedIn again" : "Get LinkedIn profile"}
                </Button>
              </ManagerOnly>
              <Button variant="outline" asChild>
                <a href={p.linkedinUrl} target="_blank" rel="noreferrer">
                  LinkedIn <ExternalLink />
                </a>
              </Button>
            </>
            )}
          </>
        }
      />

      {fillingIn && (
        <EnrichDialog wsId={wsId} personIds={[p.id]} onClose={() => setFillingIn(false)} onDone={() => person.reload()} />
      )}
      {readingPosts && (
        <ReadPostsDialog
          wsId={wsId}
          personIds={[p.id]}
          onClose={() => setReadingPosts(false)}
          onDone={() => {
            person.reload()
            own.reload()
            content.reload()
          }}
        />
      )}
      <Tabs defaultValue="overview" className="px-4 pb-10 md:px-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="emails">Emails ({theirEmails.length})</TabsTrigger>
          <TabsTrigger value="posts">Posts ({posts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="pt-5"><PersonTimeline wsId={wsId} personId={id} /></TabsContent>
        <TabsContent value="overview" className="pt-5">
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="divide-y [&>*]:py-6 [&>*:first-child]:pt-0">
              <Block title="Email">
                {p.email ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <a href={`mailto:${p.email}`} className="font-medium text-data hover:underline">
                      {p.email}
                    </a>
                    {address && <Pill tone={address.tone}>{address.label}</Pill>}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">None yet. Reveal it from the People page (Apollo credits).</p>
                )}
              </Block>
              <DataGroup
                title="Role"
                values={{
                  ...(p.title ? { Title: p.title } : {}),
                  ...(p.seniority ? { Seniority: SENIORITY[p.seniority] ?? p.seniority.replaceAll("_", " ").replace(/^\w/, (ch) => ch.toUpperCase()) } : {}),
                  ...(data.Role ?? {}),
                }}
              />
              {Object.entries(data)
                .filter(([group]) => group !== "Role")
                .map(([group, values]) => (
                  <DataGroup key={group} title={group} values={values} />
                ))}
            </div>
            <Panel>
              <Block title="Company">
                {companyName ? (
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-3">
                      <Avatar name={companyName} />
                      <div className="min-w-0">
                        {companyId ? (
                          <Link href={`/companies/${companyId}`} className="font-medium text-data hover:underline">
                            {companyName}
                          </Link>
                        ) : (
                          <p className="font-medium">{companyName}</p>
                        )}
                        {company.data?.domain && <p className="truncate text-xs text-muted-foreground">{company.data.domain}</p>}
                      </div>
                    </div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                      <Fact label="Industry">{about.Industry}</Fact>
                      <Fact label="Employees">{about.Employees}</Fact>
                      <Fact label="Location">{[company.data?.city ?? about.City, company.data?.state ?? about.State].filter(Boolean).join(", ")}</Fact>
                      <Fact label="Status">{company.data ? <StatusPill status={company.data.status} /> : null}</Fact>
                    </dl>
                    {companyId && (
                      <Link href={`/companies/${companyId}`} className="inline-flex items-center gap-1 text-[13px] text-data hover:underline">
                        Open company <ArrowRight className="size-3.5" />
                      </Link>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Not known.</p>
                )}
              </Block>
              <Block title="Where they stand">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <Fact label="Lead">{p.queuedAt ? `Since ${shortDate(p.queuedAt)}` : "Not yet"}</Fact>
                  <Fact label="Emails">{theirEmails.length}</Fact>
                  <Fact label="Posts">{posts.length}</Fact>
                  <Fact label="Found">
                    {p.emailStatus === "website" ? "Company website" : (FOUND_BY[p.source] ?? p.source)}, {shortDate(p.foundAt)}
                  </Fact>
                </dl>
              </Block>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="emails" className="pt-5">
          {!leadId || theirEmails.length === 0 ? (
            <p className="text-sm text-muted-foreground">None written yet. Select them on People and choose Write emails.</p>
          ) : (
            <ul className="max-w-3xl divide-y">
              {theirEmails.map((e) => {
                const status = EMAIL_STATUS[e.status] ?? { label: e.status, tone: "neutral" as PillTone }
                return (
                  <li key={e.id} className="space-y-1.5 py-4 first:pt-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Pill tone={status.tone}>{status.label}</Pill>
                      {e.score !== null && <span>Score {e.score}</span>}
                      <span>{shortDate(e.createdAt)}</span>
                      {(e.status === "draft" || e.status === "edited") && (
                        <Link href={`/review?email=${encodeURIComponent(e.id)}`} className="underline">
                          Review it
                        </Link>
                      )}
                    </div>
                    <p className="text-sm font-medium">{e.subject}</p>
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">{e.body}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="posts" className="pt-5">
          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No posts yet. Fetch posts on People reads the company&apos;s LinkedIn, their own, then the company&apos;s Instagram.
            </p>
          ) : (
            <ul className="max-w-3xl divide-y">
              {posts.map((x) => (
                <li key={x.id} className="space-y-1 py-3 first:pt-0">
                  <a href={x.url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline">
                    {x.whose} · {x.source === "linkedin" ? "LinkedIn" : "Instagram"} · {x.postedAt ? shortDate(x.postedAt) : "Undated"}
                  </a>
                  <p className="text-sm whitespace-pre-wrap">{x.text || "No text"}</p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </>
  )
}
