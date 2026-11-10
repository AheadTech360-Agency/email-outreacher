"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CampaignEditor, NEW_CAMPAIGN } from "@/components/config/campaign-editor"
import { Page } from "@/components/config/shell"
import { addCampaign, canManage, fetchSendingStatus, useApi } from "@/lib/config-api"
import { useSession } from "@/lib/config-session"

export default function NewCampaignPage() {
  const { workspaceId, me, href } = useSession()
  const router = useRouter()
  const status = useApi(fetchSendingStatus, [])
  return (
    <Page title="New campaign" description="It starts as a draft: nothing is sent until you start it and add leads.">
      {!canManage(me?.role) ? (
        <p className="text-[13.5px] text-muted-foreground">Only Management and admins can create campaigns.</p>
      ) : (
        <CampaignEditor
          initial={NEW_CAMPAIGN}
          variables={status.data?.variables ?? {}}
          saveLabel="Create campaign"
          onSave={async (input) => {
            if (!workspaceId) throw new Error("Pick a workspace first.")
            const made = await addCampaign(workspaceId, input)
            toast.success(`Created ${made.name}`, { description: "It's a draft. Add leads, then start it." })
            router.push(href(`/campaigns/${made.id}`))
          }}
        />
      )}
    </Page>
  )
}
