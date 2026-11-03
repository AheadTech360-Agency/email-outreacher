"use client"

import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { Ban, Check, DatabaseZap, ExternalLink, Newspaper, Globe, MoreHorizontal, RotateCcw, UserSearch, X } from "lucide-react"
import { toast } from "sonner"
import { BackendError, WorkspaceGate } from "@/components/companies/backend-state"
import { CompanyContacts, ExcludeCompanyDialog } from "@/components/companies/company-contacts"
import { FindStakeholdersDialog } from "@/components/companies/find-stakeholders-dialog"
import { SOURCE_NAME, StatusPill } from "@/components/companies/pipeline-cells"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EnrichDialog } from "@/components/enrich-dialog"
import { ReadPostsDialog } from "@/components/read-posts-dialog"
import { ManagerOnly } from "@/components/manager-only"
import { Avatar, Block, DataGroup, Fact, Panel, RecordHeader } from "@/components/record-header"
import { Pill } from "@/components/status"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  type PipelineCompany, decideCompanies, fetchAllStakeholders, fetchCompanyContent, fetchPipelineCompany, rereadCompany, researchCompanies, useApi,
} from "@/lib/api" // prettier-ignore
import { useAuth } from "@/lib/auth"
import { compactCount, formatUsd, shortDate } from "@/lib/format"
import { canManage } from "@/lib/roles"

const COST_PER_VERIFY = 0.004 // website (free), Instagram profile and Claude's score
const NETWORK: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", x: "X", tiktok: "TikTok", youtube: "YouTube",
  pinterest: "Pinterest", threads: "Threads",
}  // prettier-ignore
const ROLE: Record<string, string> = { homepage: "Homepage", contact: "Contact", social: "Social links", about: "About" }

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>()
  return <WorkspaceGate>{(wsId) => <Company key={`${wsId}-${id}`} wsId={wsId} id={id} />}</WorkspaceGate>
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : undefined)

function Company({ wsId, id }: { wsId: string; id: string }) {
  const router = useRouter()
  const tab = useSearchParams().get("tab") ?? "overview"
  const { me } = useAuth()
  const company = useApi(() => fetchPipelineCompany(wsId, id), [wsId, id])
  const people = useApi(() => fetchAllStakeholders(wsId), [wsId])
  const content = useApi(() => fetchCompanyContent(wsId, id), [wsId, id])
  const [busy, setBusy] = useState("")
  const [finding, setFinding] = useState(false)
  const [reverifying, setReverifying] = useState(false)
  const [excluding, setExcluding] = useState(false)
  const [fillingIn, setFillingIn] = useState(false)
  const [readingPosts, setReadingPosts] = useState(false)

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
  const posts = content.data?.posts ?? []
  const canVerify = c.source !== "lead_intel"

  const act = async (label: string, call: () => Promise<unknown>, done: string) => {
    setBusy(label)
    try {
      await call()
      toast.success(done)
      company.reload()
    } catch (e) {
      toast.error("Couldn't do that", { description: errorText(e) })
    } finally {
      setBusy("")
    }
  }
  const reread = () =>
    void act(
      "reread",
      async () => {
        const r = await rereadCompany(wsId, c.id)
        if (!r.reached) throw new Error(r.detail ?? "The site couldn't be read")
        content.reload()
        const n = Object.keys(r.socials).length
        toast.message(`Read ${r.pages} page${r.pages === 1 ? "" : "s"}${r.via === "jina" ? " with Jina" : ""}`, {
          description: [`${n} social${n === 1 ? "" : "s"}`, r.emails.length ? r.emails.join(", ") : "no email", r.phone ?? "no phone"].join(" · "),
        })
      },
      "Website read again",
    )

  const primary =
    c.status === "qualified" ? (
      <ManagerOnly>
        <Button onClick={() => setFinding(true)}>
          <UserSearch /> Find people
        </Button>
      </ManagerOnly>
    ) : c.status === "found" && canVerify ? (
      <ManagerOnly>
        <Button disabled={!!busy} onClick={() => void act("verify", () => researchCompanies(wsId, [c.id], true), "Verified")}>
          {busy === "verify" ? "Verifying…" : "Verify"}
        </Button>
      </ManagerOnly>
    ) : (
      <ManagerOnly>
        <Button disabled={!!busy} onClick={() => void act("approve", () => decideCompanies(wsId, [c.id], "qualified"), "Approved")}>
          <Check /> Approve
        </Button>
      </ManagerOnly>
    )

  return (
    <>
      <RecordHeader
        back={{ href: "/companies", label: "Companies" }}
        title={c.name}
        avatar={<Avatar name={c.name} />}
        facts={[
          <StatusPill key="s" status={c.status} />,
          c.score !== null && <span className="tabular-nums">Score {c.score}</span>,
          (c.domain || c.websiteUrl) && (
            <a href={c.websiteUrl ?? `https://${c.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
              {c.domain ?? c.websiteUrl} <ExternalLink className="size-3" aria-hidden />
            </a>
          ),
          [c.city, c.state].filter(Boolean).join(", "),
          `from ${SOURCE_NAME[c.source]}`,
        ]}
        actions={
          <>
            {canVerify && (
              <ManagerOnly>
                <Button variant="outline" disabled={!!busy} onClick={reread} title="Socials, emails, phone and pages. No AI, nothing paid.">
                  <Globe /> {busy === "reread" ? "Reading…" : "Re-read website"}
                </Button>
              </ManagerOnly>
            )}
            {primary}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {c.status !== "qualified" && c.status !== "found" && (
                  <DropdownMenuItem disabled={!canManage(me?.role)} onSelect={() => void act("approve", () => decideCompanies(wsId, [c.id], "qualified"), "Approved")}>
                    <Check /> Approve
                  </DropdownMenuItem>
                )}
                {c.status === "qualified" && (
                  <DropdownMenuItem disabled={!canManage(me?.role)} onSelect={() => void act("approve", () => decideCompanies(wsId, [c.id], "qualified"), "Approved")}>
                    <Check /> Approve again
                  </DropdownMenuItem>
                )}
                {c.status !== "not_fit" && (
                  <DropdownMenuItem disabled={!canManage(me?.role)} onSelect={() => void act("reject", () => decideCompanies(wsId, [c.id], "not_fit"), "Rejected")}>
                    <X /> Reject
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem disabled={!canManage(me?.role)} onSelect={() => setReadingPosts(true)}>
                  <Newspaper /> Read posts (LinkedIn, Instagram)
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canManage(me?.role)} onSelect={() => setFillingIn(true)}>
                  <DatabaseZap /> Fill in (Instagram, LinkedIn{here.length ? ", people" : ""})
                </DropdownMenuItem>
                {canVerify && c.researchedAt && (
                  <DropdownMenuItem disabled={!canManage(me?.role)} onSelect={() => setReverifying(true)}>
                    <RotateCcw /> Verify again
                  </DropdownMenuItem>
                )}
                {canManage(me?.role) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onSelect={() => setExcluding(true)}>
                      <Ban /> Never contact
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <Tabs defaultValue={tab} className="px-4 pb-10 md:px-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="people">People ({here.length})</TabsTrigger>
          <TabsTrigger value="posts">Posts ({posts.length})</TabsTrigger>
          <TabsTrigger value="website">Website</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-5">
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="divide-y [&>*]:py-6 [&>*:first-child]:pt-0">
              <Verdict company={c} />
              {Object.entries(c.data ?? {}).map(([group, values]) => (
                <DataGroup key={group} title={group} values={values} />
              ))}
            </div>
            <Panel>
              <Block title="Contact">
                <CompanyContacts workspaceId={wsId} company={c} />
              </Block>
              <Block title="Socials">
                <Socials company={c} />
              </Block>
              <Block title="At a glance">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <Fact label="People">{here.length}</Fact>
                  <Fact label="Posts saved">{posts.length}</Fact>
                  <Fact label="Added">{shortDate(c.createdAt)}</Fact>
                  <Fact label="Verified">{c.researchedAt ? shortDate(c.researchedAt) : "Not yet"}</Fact>
                </dl>
              </Block>
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="people" className="pt-5">
          {people.loading && !people.data ? (
            <Skeleton className="h-24 w-full" />
          ) : here.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody found here yet.{c.status === "qualified" ? " Use Find people above." : " Approve it first, then find people."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
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
                      <TableCell>
                        {p.queuedAt ? <Pill tone="positive">Lead</Pill> : <span className="text-[13px] text-muted-foreground">Not yet</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="posts" className="pt-5">
          {content.loading && !content.data ? (
            <Skeleton className="h-24 w-full" />
          ) : posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No posts of theirs saved yet. Fetch posts on People reads the company&apos;s LinkedIn and Instagram.
            </p>
          ) : (
            <ul className="max-w-3xl divide-y">
              {posts.map((p) => (
                <li key={p.id} className="space-y-1 py-3 first:pt-0">
                  <a href={p.url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:underline">
                    {NETWORK[p.source] ?? p.source} · {p.postedAt ? shortDate(p.postedAt) : "Undated"}
                  </a>
                  <p className="text-sm whitespace-pre-wrap">{p.text || "No text"}</p>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="website" className="pt-5">
          <Website company={c} pages={content.data?.pages ?? []} loading={content.loading && !content.data} />
        </TabsContent>
      </Tabs>

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
      {readingPosts && (
        <ReadPostsDialog wsId={wsId} companyIds={[c.id]} onClose={() => setReadingPosts(false)} onDone={() => content.reload()} />
      )}
      {fillingIn && (
        <EnrichDialog
          wsId={wsId}
          companyIds={[c.id]}
          personIds={here.filter((p) => p.linkedinUrl).map((p) => p.id)}
          onClose={() => setFillingIn(false)}
          onDone={() => {
            company.reload()
            content.reload()
            people.reload()
          }}
        />
      )}
      {excluding && (
        <ExcludeCompanyDialog workspaceId={wsId} company={c} onClose={() => setExcluding(false)} onExcluded={() => router.push("/companies")} />
      )}
      <ConfirmDialog
        open={reverifying}
        onOpenChange={setReverifying}
        title={`Verify ${c.name} again?`}
        description={`Reads the website again and scores with the current verification prompt. The new verdict replaces the old one, including one you set by hand. About ${formatUsd(COST_PER_VERIFY)}, logged on Usage.`}
        confirmLabel="Verify again"
        onConfirm={() => {
          setReverifying(false)
          void act("verify", () => researchCompanies(wsId, [c.id], true), "Verified again")
        }}
      />
    </>
  )
}

function Verdict({ company: c }: { company: PipelineCompany }) {
  const score = c.scoreDetail
  return (
    <Block title="Why it's here">
      {!c.researchedAt && c.status === "found" ? (
        <p className="text-sm text-muted-foreground">Not verified yet. Verify reads its website and scores how well it fits the ICP.</p>
      ) : (
        <div className="space-y-4 text-sm">
          {c.statusReason && <p>{c.statusReason}</p>}
          {score && !score.error && score.reasons.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Fits</p>
              <ul className="space-y-1">
                {score.reasons.map((r) => (
                  <li key={r} className="flex gap-2">
                    <Check className="mt-0.5 size-4 flex-none text-positive" aria-hidden /> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {score && !score.error && score.concerns.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Concerns</p>
              <ul className="space-y-1">
                {score.concerns.map((r) => (
                  <li key={r} className="flex gap-2 text-muted-foreground">
                    <X className="mt-0.5 size-4 flex-none text-warning" aria-hidden /> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {c.researchedAt && <p className="text-xs text-muted-foreground">Verified {shortDate(c.researchedAt)}{score?.model ? ` by ${score.model}` : ""}.</p>}
        </div>
      )}
    </Block>
  )
}

function Socials({ company: c }: { company: PipelineCompany }) {
  const all = {
    ...(c.research?.socials ?? {}),
    ...(c.linkedinUrl ? { linkedin: c.linkedinUrl } : {}),
    ...(c.instagramUrl ? { instagram: c.instagramUrl } : {}),
    ...(c.facebookUrl ? { facebook: c.facebookUrl } : {}),
    ...(c.twitterUrl ? { x: c.twitterUrl } : {}),
  }
  const ig = c.research?.instagram
  if (Object.keys(all).length === 0)
    return <p className="text-sm text-muted-foreground">None found. Re-read website looks for the ones their site links.</p>
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {Object.entries(all).map(([network, url]) => (
          <Fact key={network} label={NETWORK[network] ?? network}>
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-data hover:underline">
              {url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} <ExternalLink className="size-3 text-muted-foreground" aria-hidden />
            </a>
          </Fact>
        ))}
      </dl>
      {ig && (
        <p className="text-[13px] text-muted-foreground">
          Instagram: @{ig.handle}
          {ig.followers !== null ? `, ${compactCount(ig.followers)} followers` : ""}
          {ig.category ? `, ${ig.category}` : ""}
        </p>
      )}
    </div>
  )
}

function Website({ company: c, pages, loading }: { company: PipelineCompany; pages: { url: string; role: string; text: string }[]; loading: boolean }) {
  const site = c.research?.website
  if (loading) return <Skeleton className="h-24 w-full" />
  if (!site) return <p className="text-sm text-muted-foreground">Not read yet. Verify or Re-read website reads it.</p>
  if (site.outcome !== "ok" && site.outcome !== "no_text")
    return <p className="text-sm text-muted-foreground">Couldn&apos;t read it: {site.detail ?? site.outcome.replaceAll("_", " ")}</p>
  return (
    <div className="max-w-3xl space-y-3">
      <p className="text-xs text-muted-foreground">
        {pages.length} {pages.length === 1 ? "page" : "pages"} read {site.via === "jina" ? "with Jina (a browser)" : "directly"}
      </p>
      {(pages.length ? pages : [{ url: site.url ?? c.domain ?? "", role: "homepage", text: site.text }]).map((p) => (
        <details key={p.url} className="rounded-md border px-3 py-2 text-sm" open={pages.length <= 1}>
          <summary className="cursor-pointer truncate">
            <span className="font-medium">{ROLE[p.role] ?? p.role}</span>{" "}
            <span className="text-muted-foreground">{p.url.replace(/^https?:\/\//, "")}</span>
          </summary>
          <p className="mt-2 max-h-96 overflow-y-auto leading-relaxed whitespace-pre-wrap">{p.text || "No text on this page."}</p>
        </details>
      ))}
    </div>
  )
}
