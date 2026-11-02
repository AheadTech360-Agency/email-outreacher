"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Copy, FileText, MoreHorizontal, PencilLine, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { ManagerOnly } from "@/components/manager-only"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { shortDate } from "@/lib/format"
import { FOLLOWUP_KINDS, ICP_PROMPT_FIELD, type IcpPromptKind, icpsUsingTemplate, isIcpPromptKind, resolveScoringTemplate } from "@/lib/selectors"
import { useStore } from "@/lib/store"
import type { PromptKind, PromptTemplate } from "@/lib/types"

const SECTIONS: { kind: PromptKind; title: string; description: string }[] = [
  {
    kind: "verify",
    title: "Company verification",
    description: "Scores how well a researched company fits the ICP, from its website, Instagram and Apollo data.",
  },
  {
    kind: "hook",
    title: "Hook selection",
    description: "Reads a person's posts, pulls out the main points and picks the one to focus the email on.",
  },
  { kind: "email", title: "Email generation", description: "Writes the subject and body from the ICP, the person and the hook." },
  {
    kind: "score",
    title: "Email scoring",
    description: "Scores every drafted email from 0 to 100. Decides what waits for review and what can be sent automatically.",
  },
  {
    kind: "followup2",
    title: "Follow-up (email 2)",
    description: "Written just before it's due, only for leads who haven't replied. The default is used for every ICP.",
  },
  {
    kind: "followup3",
    title: "Follow-up (email 3)",
    description: "The last email, closing the loop. Written just before it's due, only if there's still no reply.",
  },
]

export default function PromptsPage() {
  const { templates, versions, icps, settings, duplicateTemplate, deleteTemplate, promptsStatus, promptsError, reloadPrompts } =
    useStore()
  const loading = promptsStatus === "loading"
  const router = useRouter()
  const [deleting, setDeleting] = useState<PromptTemplate | null>(null)

  /** Why a template can't be deleted, or "" when it can. */
  const lockReason = (t: PromptTemplate) => {
    if (t.isDefault) return "It's the default. Make another prompt the default first."
    if (t.kind === "score" && settings.scoring.promptId === t.id) return "It's the scoring prompt chosen in Settings."
    const users = isIcpPromptKind(t.kind) ? icps.filter((i) => i[ICP_PROMPT_FIELD[t.kind as IcpPromptKind]] === t.id) : []
    if (users.length) return `It's used by ${users.map((i) => i.name).join(", ")}.`
    return ""
  }

  return (
    <>
      <PageHeader
        title="Prompts"
        description={`${templates.length} prompts, every one versioned. Open one to edit, test and compare versions.`}
        actions={
          <ManagerOnly><Button asChild>
            <Link href="/prompts/new">
              <Plus /> New prompt
            </Link>
          </Button></ManagerOnly>
        }
      />
      <div className="space-y-8 px-4 pb-10 md:px-8">
        {promptsStatus === "error" && (
          <p className="text-sm text-destructive">
            Couldn&apos;t load prompts: {promptsError}{" "}
            <button type="button" className="underline" onClick={reloadPrompts}>
              Try again
            </button>
          </p>
        )}
        {SECTIONS.map(({ kind, title, description }) => {
          const list = templates.filter((t) => t.kind === kind)
          return (
            <section key={kind} className="space-y-2">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold">{title}</h2>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/prompts/new?kind=${kind}`}>
                    <Plus /> New {title.toLowerCase()} prompt
                  </Link>
                </Button>
              </div>
              {loading ? (
                <TableSkeleton rows={2} />
              ) : list.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title={`No ${title.toLowerCase()} prompts`}
                  action={
                    <Button asChild variant="outline">
                      <Link href={`/prompts/new?kind=${kind}`}>
                        <Plus /> New {title.toLowerCase()} prompt
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Template</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>Used by</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="w-10">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((t) => {
                        const v = versions.find((x) => x.id === t.currentVersionId)
                        const count = versions.filter((x) => x.templateId === t.id).length
                        const usedBy = icpsUsingTemplate(icps, t)
                        const scoringInUse = t.kind === "score" && resolveScoringTemplate(templates, settings.scoring)?.id === t.id
                        const locked = lockReason(t)
                        return (
                          <TableRow key={t.id}>
                            <TableCell>
                              <Link href={`/prompts/${t.id}`} className="font-medium hover:underline">
                                {t.name}
                              </Link>
                              {t.isDefault && (
                                <Badge variant="secondary" className="ml-2">
                                  Default
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground tabular-nums">
                              v{v?.version} <span className="text-xs">({count} total)</span>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{v?.model}</TableCell>
                            <TableCell>
                              {t.kind === "score" ? (
                                scoringInUse ? (
                                  <Link href="/settings#scoring">
                                    <Badge variant="outline" className="font-normal">
                                      All ICPs, set in Settings
                                    </Badge>
                                  </Link>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Not used</span>
                                )
                              ) : FOLLOWUP_KINDS.includes(t.kind) ? (
                                t.isDefault ? (
                                  <Badge variant="outline" className="font-normal">
                                    All ICPs
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Not used</span>
                                )
                              ) : usedBy.length ? (
                                <div className="flex flex-wrap gap-1">
                                  {usedBy.map((icp) => (
                                    <Link key={icp.id} href={`/icps/${icp.id}/prompts`}>
                                      <Badge variant="outline" className="font-normal">
                                        {icp.name}
                                      </Badge>
                                    </Link>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">Not used</span>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {v && shortDate(v.createdAt)}
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${t.name}`}>
                                    <MoreHorizontal />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-64">
                                  <DropdownMenuItem onSelect={() => router.push(`/prompts/${t.id}`)}>
                                    <PencilLine /> Open in editor
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      duplicateTemplate(t.id).then(
                                        (copy) => toast.success(`Created ${copy.name}`),
                                        (e: unknown) => toast.error("Couldn't duplicate it", { description: e instanceof Error ? e.message : undefined }),
                                      )
                                    }
                                  >
                                    <Copy /> Duplicate
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    disabled={!!locked}
                                    onSelect={() => setDeleting(t)}
                                  >
                                    <Trash2 /> Delete
                                  </DropdownMenuItem>
                                  {locked && <p className="px-2 pb-1.5 text-xs text-muted-foreground">Can&apos;t delete: {locked}</p>}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          )
        })}
      </div>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        destructive
        title={deleting ? `Delete ${deleting.name}?` : ""}
        description="The prompt and all of its versions are removed. Drafts it already wrote are kept. This can't be undone."
        confirmLabel="Delete prompt"
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteTemplate(deleting.id)
            toast.success(`Deleted ${deleting.name}`)
          } catch (e) {
            toast.error("Couldn't delete it", { description: e instanceof Error ? e.message : undefined })
          } finally {
            setDeleting(null)
          }
        }}
      />
    </>
  )
}
