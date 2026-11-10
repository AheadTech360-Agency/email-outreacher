"use client"

import Link from "next/link"
import { Page } from "@/components/config/shell"
import { Button } from "@/components/ui/button"
import { useSession } from "@/lib/config-session"

/** An address the sending dashboard doesn't have (Coldbrew's own pages aren't on its address). */
export default function ConfigNotFound() {
  const { href } = useSession()
  return (
    <Page title="This page isn't here" description="The sending dashboard has Overview, Sender accounts and Personas. Coldbrew's other pages are on Coldbrew's own address.">
      <Button asChild variant="outline">
        <Link href={href("/")}>Go to Overview</Link>
      </Button>
    </Page>
  )
}
