"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { Briefcase, Camera, Mail, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { CampaignEditor, newCampaign } from "@/components/config/campaign-editor"
import { Page } from "@/components/config/shell"
import { type Channel, addCampaign, canManage, fetchSendingStatus, useApi } from "@/lib/config-api"
import { useSession } from "@/lib/config-session"
import { cn } from "@/lib/utils"

const CHANNELS: { value: Channel; name: string; icon: LucideIcon; what: string }[] = [
  { value: "email", name: "Email", icon: Mail, what: "Coldbrew's first email, then follow-ups, from your sending mailboxes." },
  { value: "linkedin", name: "LinkedIn", icon: Briefcase, what: "A connection request, then messages once they accept, from your LinkedIn accounts." },
  { value: "instagram", name: "Instagram", icon: Camera, what: "Direct messages from your Instagram accounts." },
]

export default function NewCampaignPage() {
  return (
    <Suspense>
      <NewCampaign />
    </Suspense>
  )
}

function NewCampaign() {
  const { workspaceId, me, href } = useSession()
  const router = useRouter()
  const params = useSearchParams()
  const asked = params.get("channel")
  const [channel, setChannel] = useState<Channel>(asked === "linkedin" || asked === "instagram" ? asked : "email")
  const status = useApi(fetchSendingStatus, [])
  const social = channel !== "email"

  return (
    <Page title="New campaign" description="It starts as a draft: nothing is sent until you start it and add leads.">
      {!canManage(me?.role) ? (
        <p className="text-[13.5px] text-muted-foreground">Only Management and admins can create campaigns.</p>
      ) : (
        <div className="space-y-6">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Channel</legend>
            <div role="radiogroup" aria-label="Channel" className="grid gap-3 sm:grid-cols-3">
              {CHANNELS.map((c) => {
                const on = c.value === channel
                const Icon = c.icon
                return (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setChannel(c.value)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "border-primary bg-accent/50" : "hover:bg-muted/50",
                    )}
                  >
                    <Icon className={cn("mt-0.5 size-4 flex-none", on ? "text-primary" : "text-muted-foreground")} aria-hidden />
                    <span>
                      <span className="block text-[14px] font-semibold">{c.name}</span>
                      <span className="mt-0.5 block text-[12.5px] leading-[18px] text-muted-foreground">{c.what}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[12.5px] text-muted-foreground">The channel is set when the campaign is made. A lead can be in one campaign per channel at a time.</p>
          </fieldset>

          <CampaignEditor
            key={channel}
            initial={newCampaign(channel, status.data)}
            variables={(social ? status.data?.socialVariables : status.data?.variables) ?? {}}
            saveLabel="Create campaign"
            onSave={async (input) => {
              if (!workspaceId) throw new Error("Pick a workspace first.")
              const made = await addCampaign(workspaceId, input)
              toast.success(`Created ${made.name}`, { description: "It's a draft. Add leads, then start it." })
              router.push(href(`/campaigns/${made.id}`))
            }}
          />
        </div>
      )}
    </Page>
  )
}
