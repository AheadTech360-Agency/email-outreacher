"use client"

import { useState, type ReactNode } from "react"
import { AtSign, Ban, Check, ContactRound, ExternalLink, Globe, Sparkles, UserSearch, X } from "lucide-react"
import { CompanyContacts, ExcludeCompanyDialog } from "@/components/companies/company-contacts"
import { SOURCE_NAME, StatusPill } from "@/components/companies/pipeline-cells"
import { ManagerOnly } from "@/components/manager-only"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { type PipelineCompany, fetchCompanyContent, fetchCompanyDetail, useApi } from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { compactCount, shortDate } from "@/lib/format"

const RULE_SOURCE: Record<string, string> = {
  business_name: "business name",
  website_text: "website",
  website_domain: "web address",
  instagram_bio: "Instagram bio",
  instagram_category: "Instagram category",
  instagram_handle: "Instagram username",
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Globe; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-rule px-5 py-4">
      <h3 className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  )
}

function LeadIntelText({ businessId }: { businessId: string }) {
  const detail = useApi(() => fetchCompanyDetail(businessId), [businessId])
  if (detail.loading) return <Skeleton className="h-16 w-full" />
  if (!detail.data?.siteText) return <p className="text-[13px] text-muted-foreground">Lead Intel hasn&apos;t stored any website text.</p>
  return <blockquote className="max-h-60 overflow-y-auto rounded-md bg-muted/50 px-3 py-2 text-[13px] leading-relaxed">{detail.data.siteText}</blockquote>
}

const ROLE: Record<string, string> = { homepage: "Homepage", contact: "Contact", social: "Social links", about: "About" }

/** Every page research read, with its full text, and the company's own recent Instagram posts. */
function StoredContent({ workspaceId, companyId }: { workspaceId: string; companyId: string }) {
  const content = useApi(() => fetchCompanyContent(workspaceId, companyId), [workspaceId, companyId])
  if (content.loading && !content.data) return <Skeleton className="h-16 w-full" />
  if (!content.data) return <p className="text-[13px] text-destructive">{content.error}</p>
  const { pages, posts } = content.data
  return (
    <>
      {pages.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {pages.length} {pages.length === 1 ? "page" : "pages"} read, full text kept
          </p>
          {pages.map((p) => (
            <details key={p.url} className="rounded-md border px-3 py-1.5 text-[13px]">
              <summary className="cursor-pointer truncate">
                <span className="font-medium">{ROLE[p.role] ?? p.role}</span>{" "}
                <span className="text-muted-foreground">
                  {p.url.replace(/^https?:\/\//, "")} · {p.text.length.toLocaleString()} characters
                </span>
              </summary>
              <p className="mt-2 max-h-72 overflow-y-auto leading-relaxed whitespace-pre-wrap">{p.text || "No text on this page."}</p>
            </details>
          ))}
        </div>
      )}
      {posts.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-xs text-muted-foreground">Their latest Instagram posts</p>
          <ul className="space-y-1.5">
            {posts.slice(0, 6).map((p) => (
              <li key={p.id} className="text-[13px]">
                <a href={p.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:underline">
                  {p.postedAt ? shortDate(p.postedAt) : "Undated"} · {p.mediaType}
                </a>
                <p className="line-clamp-2">{p.text || "No caption"}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

/** Everything known about a pipeline company: why it is where it is, and what was read. */
export function PipelineSheet({
  workspaceId,
  company,
  busy,
  onClose,
  onStatus,
  onFindStakeholders,
  onExcluded,
}: {
  workspaceId: string
  company: PipelineCompany
  busy: boolean
  onClose: () => void
  onStatus: (status: "qualified" | "not_fit") => void
  onFindStakeholders: () => void
  /** The company went on the do-not-contact list: reload it. */
  onExcluded: () => void
}) {
  const { me } = useAuth()
  const [excluding, setExcluding] = useState(false)
  const canExclude = me?.role === "admin" || me?.role === "management"
  const site = company.research?.website
  const ig = company.research?.instagram
  const socials = { ...(company.research?.socials ?? {}), ...(company.instagramUrl ? { instagram: company.instagramUrl } : {}) }
  const score = company.scoreDetail

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full! gap-0 overflow-y-auto sm:max-w-lg!">
        <SheetHeader className="px-5 pt-5 pb-4">
          <SheetTitle className="text-lg">{company.name}</SheetTitle>
          <SheetDescription>
            {company.domain ?? "No website"} · from {SOURCE_NAME[company.source]}
            {company.researchedAt ? ` · researched ${shortDate(company.researchedAt)}` : ""}
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <StatusPill status={company.status} />
            {company.score !== null && <span className="text-sm font-medium tabular-nums">Score {company.score}</span>}
            {company.overridden && <span className="text-xs text-muted-foreground">set by hand</span>}
          </div>
          {company.statusReason && <p className="pt-1 text-[13px] text-muted-foreground">{company.statusReason}</p>}
          <div className="flex flex-wrap gap-2 pt-2">
            {company.status === "qualified" && (
              <ManagerOnly><Button size="sm" onClick={onFindStakeholders}>
                <UserSearch /> Find stakeholders
              </Button></ManagerOnly>
            )}
            {company.status !== "qualified" && (
              <ManagerOnly><Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus("qualified")}>
                <Check /> Approve
              </Button></ManagerOnly>
            )}
            {company.status !== "not_fit" && (
              <ManagerOnly><Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus("not_fit")}>
                <X /> Reject
              </Button></ManagerOnly>
            )}
            {canExclude && (
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setExcluding(true)}>
                <Ban /> Never contact
              </Button>
            )}
          </div>
        </SheetHeader>
        {excluding && (
          <ExcludeCompanyDialog workspaceId={workspaceId} company={company} onClose={() => setExcluding(false)} onExcluded={onExcluded} />
        )}

        <Section title="Contacts on their site" icon={ContactRound}>
          <CompanyContacts workspaceId={workspaceId} company={company} />
        </Section>

        {score && !score.error && (
          <Section title={`Claude's score (${score.model})`} icon={Sparkles}>
            <p className="text-[13px]">{score.summary}</p>
            {score.reasons.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
                {score.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {score.concerns.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-warning">
                {score.concerns.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
            {score.reading && (
              <div className="space-y-1 pt-1">
                <p className="text-xs text-muted-foreground">
                  {score.reading.length
                    ? `Read the homepage, then chose ${score.reading.length} more ${score.reading.length === 1 ? "page" : "pages"}:`
                    : "The homepage was enough to decide."}
                </p>
                {score.reading.length > 0 && (
                  <ol className="list-decimal space-y-0.5 pl-5 text-[13px]">
                    {score.reading.map((r) => (
                      <li key={r.url}>
                        <span className="break-all">{r.url.replace(/^https?:\/\/[^/]+/, "") || "/"}</span>
                        {r.reason && <span className="text-muted-foreground"> · {r.reason}</span>}
                        {!r.read && <span className="text-warning"> · couldn&apos;t be read</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </Section>
        )}

        {company.ruleDetail && (
          <Section title="ICP rule" icon={Check}>
            <p className="text-[13px]">
              {company.ruleFit ? "Passes: " : "Fails: "}
              {company.ruleDetail.reason}
            </p>
            {company.ruleDetail.hits.length > 0 && (
              <p className="text-[13px] text-muted-foreground">
                Matched {company.ruleDetail.hits.map((h) => `"${h.term}" on their ${RULE_SOURCE[h.source] ?? h.source}`).join(", ")}
              </p>
            )}
            {company.ruleDetail.skipped.length > 0 && (
              <p className="text-xs text-muted-foreground">Not checked: {company.ruleDetail.skipped.join("; ")}</p>
            )}
          </Section>
        )}

        <Section title="Website" icon={Globe}>
          {company.websiteUrl || company.domain ? (
            <a
              href={company.websiteUrl ?? `https://${company.domain}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              {company.domain ?? company.websiteUrl} <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">No website on file.</p>
          )}
          {company.source === "lead_intel" && company.leadIntelBusinessId ? (
            <LeadIntelText businessId={company.leadIntelBusinessId} />
          ) : !site ? (
            <p className="text-[13px] text-muted-foreground">Not researched yet.</p>
          ) : site.outcome === "ok" ? (
            <>
              <p className="text-xs text-muted-foreground">Read {site.via === "jina" ? "with Jina (a browser)" : "directly"}</p>
              <blockquote className="max-h-60 overflow-y-auto rounded-md bg-muted/50 px-3 py-2 text-[13px] leading-relaxed">{site.text}</blockquote>
            </>
          ) : (
            <p className="text-[13px] text-muted-foreground">Couldn&apos;t read it: {site.detail ?? site.outcome.replaceAll("_", " ")}</p>
          )}
          {company.source !== "lead_intel" && company.researchedAt && <StoredContent workspaceId={workspaceId} companyId={company.id} />}
        </Section>

        <Section title="Instagram and socials" icon={AtSign}>
          {ig ? (
            <div className="space-y-1">
              <p className="text-sm">
                <span className="font-medium">@{ig.handle}</span>
                <span className="text-[13px] text-muted-foreground">
                  {ig.followers !== null ? ` · ${compactCount(ig.followers)} followers` : ""}
                  {ig.category ? ` · ${ig.category}` : ""}
                </span>
              </p>
              {ig.bio && <p className="text-[13px] leading-relaxed">{ig.bio}</p>}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              {socials.instagram ? "Instagram profile not read yet." : "No Instagram linked from their website."}
            </p>
          )}
          {Object.keys(socials).length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[13px]">
              {Object.entries(socials).map(([network, url]) => (
                <a key={network} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 capitalize hover:underline">
                  {network} <ExternalLink className="size-3" aria-hidden />
                </a>
              ))}
            </div>
          )}
        </Section>
      </SheetContent>
    </Sheet>
  )
}
