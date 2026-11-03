import type { ReactNode } from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode
  /** One grey sentence about the data: the finding, the scope or the period. */
  description?: ReactNode
  actions?: ReactNode
  /** Extra rows under the title, such as a pipeline strip. */
  children?: ReactNode
}) {
  return (
    <header className="px-4 pt-5 pb-5 md:px-8 md:pt-7">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <SidebarTrigger className="-ml-1.5 md:hidden" />
        <div className="min-w-0 flex-1 basis-60">
          <h1 className="truncate text-[22px] leading-8 font-semibold tracking-[-0.015em]">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </header>
  )
}
