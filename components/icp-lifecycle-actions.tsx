"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Archive, ArchiveRestore, MoreHorizontal, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/lib/auth"
import { useStore } from "@/lib/store"
import type { ICP } from "@/lib/types"

type Pending = "archive" | "delete" | null

/** Archive, restore or delete an ICP, along with its CheapSequencer campaign. Management and admins; a Prospector
 * archives or restores only their own ICPs. */
export function IcpLifecycleActions({ icp }: { icp: ICP }) {
  const { me } = useAuth()
  const { setIcpArchived, deleteIcp } = useStore()
  const router = useRouter()
  const [pending, setPending] = useState<Pending>(null)
  const [busy, setBusy] = useState(false)
  // A Prospector archives and restores only an ICP they created, and never deletes one (that removes Lead Intel's row).
  const prospector = me?.role === "prospector"
  if (prospector ? !icp.isOwner : me?.role !== "admin" && me?.role !== "management") return null

  const archive = async (archived: boolean) => {
    setBusy(true)
    const id = toast.loading(archived ? `Archiving ${icp.name}…` : `Restoring ${icp.name}…`)
    try {
      const { campaignNote } = await setIcpArchived(icp.id, archived)
      toast.success(archived ? `${icp.name} archived` : `${icp.name} restored`, { id, description: campaignNote })
    } catch (e) {
      toast.error(archived ? "Couldn't archive it" : "Couldn't restore it", { id, description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    const id = toast.loading(`Deleting ${icp.name}…`)
    try {
      await deleteIcp(icp.id)
      toast.success(`${icp.name} deleted`, { id, description: "Its companies and people are kept with no ICP." })
      router.push("/icps")
    } catch (e) {
      toast.error("Couldn't delete it", { id, description: e instanceof Error ? e.message : undefined })
      setBusy(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label={`More actions for ${icp.name}`} disabled={busy}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {icp.enabled ? (
            <DropdownMenuItem onSelect={() => setPending("archive")}>
              <Archive /> Archive ICP
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => void archive(false)}>
              <ArchiveRestore /> Restore ICP
            </DropdownMenuItem>
          )}
          {!prospector && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setPending("delete")}>
                <Trash2 /> Delete ICP
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={pending === "archive"}
        onOpenChange={(o) => !o && setPending(null)}
        title={`Archive ${icp.name}?`}
        description={`It's turned off, and its campaign "Coldbrew: ${icp.name}" is archived in CheapSequencer. Its leads, companies and emails stay, and Restore brings it back with a new draft campaign. Not possible while leads are still in the campaign.`}
        confirmLabel="Archive ICP"
        onConfirm={() => {
          setPending(null)
          void archive(true)
        }}
      />
      <ConfirmDialog
        open={pending === "delete"}
        onOpenChange={(o) => !o && setPending(null)}
        title={`Delete ${icp.name}?`}
        description="It's removed from Lead Intel for good and its campaign is archived. Its companies and people stay in Coldbrew with no ICP, so you can give them another on Home. Not possible while Lead Intel businesses are in it or emails for it are queued or sent: archive it then."
        confirmLabel={`Delete ${icp.name}`}
        destructive
        onConfirm={() => {
          setPending(null)
          void remove()
        }}
      />
    </>
  )
}
