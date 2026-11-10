"use client"

import { safeNext } from "@/lib/safe-next"
import { useRouter } from "next/navigation"
import { useEffect, useState, type FormEvent } from "react"
import { DispatchLanes } from "@/components/config/dispatch-lanes"
import { DispatchMark } from "@/components/config/dispatch-mark"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSession } from "@/lib/config-session"

export default function LoginPage() {
  const router = useRouter()
  const { session, signIn, href } = useSession()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Only a path on this app: never an address elsewhere.
  const next = () => {
    return safeNext(new URLSearchParams(window.location.search).get("next"), href("/"))
  }

  useEffect(() => {
    if (session) router.replace(next())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- next() reads the address once, when signed in
  }, [session, router])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in.")
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="login-panel relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <DispatchMark className="size-8" />
          <span className="text-[15px] font-semibold">Coldbrew Sending</span>
        </div>
        <div className="flex justify-center">
          <DispatchLanes />
        </div>
        <p className="max-w-[40ch] text-[15px] leading-6 opacity-80">
          Your mailboxes, their daily limits and who each email is from, in one place. Coldbrew sends through them.
        </p>
      </section>

      <section className="flex items-center justify-center px-4 py-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6" noValidate>
          <div className="space-y-1.5">
            <div className="mb-6 flex items-center gap-2.5 lg:hidden">
              <DispatchMark className="size-8" />
              <span className="text-[15px] font-semibold">Coldbrew Sending</span>
            </div>
            <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em]">Sign in</h1>
            <p className="text-[13.5px] text-muted-foreground">Use the same email and password as Coldbrew.</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-pill-negative px-3 py-2 text-[13px] text-pill-negative-ink">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy || !email || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </section>
    </main>
  )
}
