"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { CloudOff, FolderPlus, RotateCw } from "lucide-react"
import { EmptyState } from "@/components/empty-state"
import { TableSkeleton } from "@/components/table-skeleton"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { useStore } from "@/lib/store"

/** The backend couldn't be reached or refused the request. Says why and offers a retry. */
export function BackendError({ message, onRetry }: { message: string; onRetry: () => void }) {
  // "Company not found" and the like: the backend answered, the thing just isn't there (or isn't shared with you).
  if (/not found\.?$/i.test(message.trim()))
    return (
      <EmptyState
        icon={CloudOff}
        title="This isn't here"
        description={`${message.trim().replace(/\.$/, "")}. It may have been removed, or it isn't shared with you.`}
      />
    )
  return (
    <EmptyState
      icon={CloudOff}
      title="Couldn't load from the backend"
      description={`${message} Locally, start it with: uvicorn main:app --reload`}
      action={
        <Button variant="outline" onClick={onRetry}>
          <RotateCw /> Try again
        </Button>
      }
    />
  )
}

/** Renders its children once the current workspace is known; until then, loading, error or "none yet". */
export function WorkspaceGate({ children }: { children: (workspaceId: string) => ReactNode }) {
  const { currentWorkspaceId, workspacesStatus, workspacesError, reloadWorkspaces } = useStore()
  const { me } = useAuth()
  if (workspacesStatus === "error") return <BackendError message={workspacesError ?? ""} onRetry={reloadWorkspaces} />
  if (workspacesStatus === "loading") return <TableSkeleton rows={6} />
  if (!currentWorkspaceId && me?.role !== "admin")
    return (
      <EmptyState
        icon={FolderPlus}
        title="No workspace yet"
        description="You're signed in, but no workspace has been shared with you. Ask an admin to add you to one."
      />
    )
  if (!currentWorkspaceId)
    return (
      <EmptyState
        icon={FolderPlus}
        title="No workspaces yet"
        description="Create one to start pulling in companies."
        action={
          <Button asChild>
            <Link href="/users?tab=workspaces">
              <FolderPlus /> Create workspace
            </Link>
          </Button>
        }
      />
    )
  return <>{children(currentWorkspaceId)}</>
}
