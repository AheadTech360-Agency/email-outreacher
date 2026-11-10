import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { Shell } from "@/components/config/shell"
import { ConfigProvider } from "@/lib/config-session"
import { BASE_HEADER } from "@/lib/site"

export const metadata: Metadata = {
  title: "Coldbrew Sending",
  description: "Mailboxes, personas and sending for Coldbrew's own outreach",
}

// The sending dashboard: its own sidebar and sign-in screen, the same Coldbrew session and backend. proxy.ts tells
// it where its pages are: at the root on its own address (config.xxx.com), under /config on Coldbrew's.
export default async function ConfigLayout({ children }: LayoutProps<"/config">) {
  const base = (await headers()).get(BASE_HEADER) ?? "/config"
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false"
  return (
    <ConfigProvider base={base}>
      <Shell sidebarOpen={sidebarOpen}>{children}</Shell>
    </ConfigProvider>
  )
}
