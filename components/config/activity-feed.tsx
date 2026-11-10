"use client"

import { Ban, CircleAlert, CornerDownLeft, FlaskConical, MailX, Moon, Send, SkipForward, type LucideIcon } from "lucide-react"
import type { Activity, ActivityKind } from "@/lib/config-api"
import { cn } from "@/lib/utils"

const LOOK: Record<ActivityKind, { label: string; icon: LucideIcon; tone: string }> = {
  sent: { label: "Sent", icon: Send, tone: "text-data" },
  dry_run: { label: "Would send (dry run)", icon: FlaskConical, tone: "text-muted-foreground" },
  failed: { label: "Couldn't send", icon: CircleAlert, tone: "text-negative" },
  skipped: { label: "Skipped", icon: SkipForward, tone: "text-warning" },
  reply: { label: "Replied", icon: CornerDownLeft, tone: "text-positive" },
  bounce: { label: "Bounced", icon: MailX, tone: "text-negative" },
  unsubscribe: { label: "Unsubscribed", icon: Ban, tone: "text-warning" },
  auto_reply: { label: "Auto-reply", icon: Moon, tone: "text-muted-foreground" },
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

/** Sends and what came back, newest first. */
export function ActivityFeed({ items, showCampaign = true, empty }: { items: Activity[]; showCampaign?: boolean; empty: string }) {
  if (!items.length) return <p className="px-5 py-10 text-center text-[13.5px] text-muted-foreground">{empty}</p>
  return (
    <ol className="divide-y divide-rule">
      {items.map((a) => {
        const look = LOOK[a.kind]
        const Icon = look.icon
        return (
          <li key={`${a.kind}-${a.id}`} className="flex gap-3 px-5 py-3.5">
            <Icon className={cn("mt-0.5 size-4 flex-none", look.tone)} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-[13.5px]">
                <span className="font-medium">{look.label}</span>
                <span className="truncate">{a.leadName}</span>
                {a.leadEmail && a.leadEmail !== a.leadName && <span className="truncate text-muted-foreground">{a.leadEmail}</span>}
              </p>
              {a.subject && <p className="mt-0.5 truncate text-[12.5px] leading-[18px] text-foreground/80">{a.subject}</p>}
              {a.detail && <p className="line-clamp-2 text-[12.5px] leading-[18px] text-muted-foreground">{a.detail}</p>}
              <p className="mt-1 text-[12px] text-muted-foreground">
                {[showCampaign && a.campaign, a.mailbox && `via ${a.mailbox}`].filter(Boolean).join(", ")}
              </p>
            </div>
            <time dateTime={a.at} className="flex-none text-[12px] whitespace-nowrap text-muted-foreground tabular-nums">
              {when(a.at)}
            </time>
          </li>
        )
      })}
    </ol>
  )
}
