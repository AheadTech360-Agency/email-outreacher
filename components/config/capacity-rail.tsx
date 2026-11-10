"use client"

import type { Sender } from "@/lib/config-api"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** Can it send today: connected or not yet tested (the scheduler will test it first); paused and failing can't. */
export const canSend = (s: Sender) => s.status === "ok" || s.status === "untested"

/** Today's sending capacity in one line: every mailbox a segment as wide as its daily limit, filled by what it has
 * sent today. Paused and failing mailboxes stay in the line, hatched, so the lost capacity is visible. */
export function CapacityRail({ senders }: { senders: Sender[] }) {
  const total = senders.reduce((n, s) => n + s.dailyLimit, 0)
  const usable = senders.filter(canSend)
  const capacity = usable.reduce((n, s) => n + s.dailyLimit, 0)
  const sent = usable.reduce((n, s) => n + Math.min(s.sentToday, s.dailyLimit), 0)
  const left = capacity - sent
  const offline = senders.length - usable.length

  return (
    <section aria-labelledby="capacity-title" className="min-w-0 rounded-xl border bg-card p-5 md:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="capacity-title" className="text-[15px] font-medium">
          Sending capacity today
        </h2>
        <p className="text-[13px] text-muted-foreground tabular-nums">
          {sent.toLocaleString()} sent of {capacity.toLocaleString()} across {usable.length} {usable.length === 1 ? "mailbox" : "mailboxes"}
          {offline > 0 && `, ${offline} unavailable`}
        </p>
      </div>

      <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[56px] leading-none font-semibold tracking-[-0.03em] tabular-nums">{left.toLocaleString()}</span>
        <span className="text-[15px] text-muted-foreground">{left === 1 ? "email" : "emails"} can still go out today</span>
      </p>

      <div
        role="img"
        aria-label={`${sent} of ${capacity} sent today. ${left} left. ${offline} mailboxes unavailable.`}
        className="mt-6 flex h-10 w-full gap-[3px] overflow-hidden rounded-md"
      >
        {senders.map((s) => {
          const width = total ? (s.dailyLimit / total) * 100 : 0
          const used = Math.min(1, s.sentToday / s.dailyLimit)
          const live = canSend(s)
          return (
            <Tooltip key={s.id}>
              <TooltipTrigger asChild>
                <div
                  tabIndex={0}
                  aria-label={`${s.fromEmail}: ${s.sentToday} of ${s.dailyLimit} sent today${live ? "" : `, ${s.status}`}`}
                  className={cn(
                    "relative h-full min-w-1.5 bg-track outline-none first:rounded-l-md last:rounded-r-md focus-visible:ring-2 focus-visible:ring-ring",
                    !live && "rail-hatch",
                  )}
                  style={{ width: `${width}%` }}
                >
                  {live && <div className="absolute inset-y-0 left-0 bg-data" style={{ width: `${used * 100}%` }} />}
                  {s.status === "failed" && <div className="absolute inset-x-0 bottom-0 h-1 bg-negative" />}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <span className="font-medium">{s.fromEmail}</span>
                <span className="block tabular-nums opacity-80">
                  {s.sentToday} of {s.dailyLimit} today{live ? "" : s.status === "paused" ? ", paused" : ", can't connect"}
                </span>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-muted-foreground">
        <Key swatch="bg-data">Sent today</Key>
        <Key swatch="bg-track">Still available</Key>
        {offline > 0 && <Key swatch="rail-hatch">Paused or can&apos;t connect</Key>}
      </dl>
    </section>
  )
}

function Key({ swatch, children }: { swatch: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className={cn("size-2.5 rounded-[3px]", swatch)} aria-hidden />
      <dd>{children}</dd>
    </div>
  )
}
