"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { AuthShell } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth"
import { EMAIL_PATTERN } from "@/lib/format"

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  )
}

/** Email and password. There's no sign-up: admins add people (and their first password) on the Users page. */
function Login() {
  const { session, signIn } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/home"
  // Adding another account: the current one stays signed in on this browser until you switch back.
  const adding = params.get("add") === "1"
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (session && !adding) router.replace(next)
  }, [session, adding, next, router])

  const submit = async () => {
    setError("")
    if (!EMAIL_PATTERN.test(email.trim())) return setError("Enter your email, like name@company.com.")
    if (!password) return setError("Enter your password.")
    setBusy(true)
    try {
      await signIn(email, password)
      // A full load, so nothing from the account you were in carries over.
      if (adding) window.location.assign(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">{adding ? "Add an account" : "Sign in"}</h1>
          <p className="text-sm text-muted-foreground">
            {adding
              ? "You stay signed in to your other accounts on this browser. Switch between them from the account menu."
              : "Use the account an admin made for you."}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : adding ? "Add account" : "Sign in"}
        </Button>
        {adding && session && (
          <Button type="button" variant="ghost" className="w-full" onClick={() => router.replace(next)}>
            Cancel
          </Button>
        )}
      </form>
    </AuthShell>
  )
}
