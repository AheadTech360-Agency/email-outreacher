"use client"

import { Button } from "@/components/ui/button"

/** A list or panel that couldn't load: what went wrong, and one way forward. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section role="alert" className="rounded-xl border bg-card px-6 py-10 text-center">
      <h2 className="text-[15px] font-semibold">Couldn&apos;t load this</h2>
      <p className="mx-auto mt-1 max-w-[56ch] text-[13.5px] text-muted-foreground">{message}</p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </section>
  )
}
