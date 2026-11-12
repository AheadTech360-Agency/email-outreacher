"use client"

import { useEffect, useState } from "react"
import { Copy, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { ProspectorAccess, accessKey } from "@/components/users/prospector-access"
import { RolePicker } from "@/components/users/role-picker"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type AccessGrant, fetchUserAccess, saveUserAccess } from "@/lib/api"
import { EMAIL_PATTERN } from "@/lib/format"
import { ROLE_LABEL, otherActiveAdmins } from "@/lib/roles"
import { useStore } from "@/lib/store"
import type { Role, User } from "@/lib/types"

/** Add someone (with their sign-in and first password), or edit a user's name, role and workspaces. */
export function UserDialog({ user, initialRole, onClose }: { user?: User; initialRole?: Role; onClose: () => void }) {
  const { users, workspaces, currentUserId, currentWorkspaceId, inviteUser, updateUser } = useStore()
  const [name, setName] = useState(user?.name ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [role, setRoleState] = useState<Role>(initialRole ?? user?.role ?? "sales")
  // An admin had every workspace by default, so moving them to Sales or Management starts from none
  // and the workspaces they keep are picked on purpose.
  const demoting = user?.role === "admin" && role !== "admin"
  const [workspaceIds, setWorkspaceIds] = useState<string[]>(
    user ? (user.role === "admin" && initialRole && initialRole !== "admin" ? [] : user.workspaceIds) : [currentWorkspaceId],
  )
  const setRole = (next: Role) => {
    if (user?.role === "admin" && role === "admin" && next !== "admin") setWorkspaceIds([])
    setRoleState(next)
  }
  const [password, setPassword] = useState(() => (user ? "" : newPassword()))
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState("")
  const [touched, setTouched] = useState({ name: false, email: false, password: false })
  // A Prospector sees only what's theirs and what's shared here: each item to use, or to edit.
  const prospector = role === "prospector"
  const [grants, setGrants] = useState<Map<string, AccessGrant>>(new Map())
  const [grantsLoaded, setGrantsLoaded] = useState(!user)
  useEffect(() => {
    if (!user || user.role !== "prospector") return
    let live = true
    fetchUserAccess(user.id)
      .then((rows) => live && setGrants(new Map(rows.map((g) => [accessKey(g.kind, g.resourceId), g]))))
      .catch((e: unknown) => live && setFailure(`Couldn't load what they can see: ${e instanceof Error ? e.message : "unknown error"}`))
      .finally(() => live && setGrantsLoaded(true))
    return () => {
      live = false
    }
  }, [user])

  const isSelf = user?.id === currentUserId
  const lastAdmin = !!user && user.role === "admin" && otherActiveAdmins(users, user.id) === 0
  const emailTaken = !user && users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())

  const errors = {
    name: name.trim() ? "" : "Enter their name",
    email: !EMAIL_PATTERN.test(email.trim())
      ? "Enter a valid email, like name@company.com"
      : emailTaken
        ? "Someone with this email is already a user"
        : "",
    password: user || password.length >= 12 ? "" : "Use at least 12 characters",
    // Admins see every workspace, so there's nothing to choose.
    workspaces: role === "admin" || workspaceIds.length ? "" : "Pick at least one workspace",
  }
  const valid = !errors.name && !errors.email && !errors.password && !errors.workspaces
  const allWorkspaces = role === "admin"

  const submit = async () => {
    if (!valid) {
      setTouched({ name: true, email: true, password: true })
      return
    }
    const ids = allWorkspaces ? workspaces.map((w) => w.id) : workspaceIds
    // Only what's in a workspace they keep is shared.
    const shared = [...grants.values()].filter((g) => ids.includes(g.workspaceId))
    if (user) {
      if (!prospector) {
        void updateUser(user.id, { name: name.trim(), role, workspaceIds: ids })
        toast.success(`Saved ${name.trim()}`)
        onClose()
        return
      }
      setSaving(true)
      setFailure("")
      try {
        // The role and workspaces first: sharing is checked against them.
        await updateUser(user.id, { name: name.trim(), role, workspaceIds: ids })
        await saveUserAccess(user.id, shared)
        toast.success(`Saved ${name.trim()}`)
        onClose()
      } catch (e) {
        setFailure(`Saved their role, but not what they can see: ${e instanceof Error ? e.message : "unknown error"}`)
      } finally {
        setSaving(false)
      }
      return
    }
    setSaving(true)
    setFailure("")
    try {
      const { signIn, id } = await inviteUser({ name, email, role, workspaceIds: ids, password })
      if (prospector && shared.length) {
        try {
          await saveUserAccess(id, shared)
        } catch (e) {
          toast.error("They were added, but not what they can see", { description: e instanceof Error ? e.message : undefined })
        }
      }
      toast.success(`Added ${name.trim()}`, {
        description:
          signIn === "created"
            ? `They sign in with ${email.trim().toLowerCase()} and the password you set. Send it to them privately.`
            : "They already have a sign-in from Lead Intel, so they use that same password. The one you set wasn't used.",
        duration: 10000,
      })
      onClose()
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Couldn't add them.")
    } finally {
      setSaving(false)
    }
  }

  const toggleWorkspace = (id: string, on: boolean) =>
    setWorkspaceIds((ids) => (on ? [...ids, id] : ids.filter((w) => w !== id)))

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg!">
        <DialogHeader>
          <DialogTitle>{user ? `Edit ${user.name}` : "Add user"}</DialogTitle>
          <DialogDescription>
            {user
              ? "Change their role and which workspaces they can open."
              : "This makes their sign-in too. Send them the email and password privately."}
          </DialogDescription>
        </DialogHeader>
        <form
          id="user-form"
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="user-name">Name</Label>
              <Input
                id="user-name"
                value={name}
                autoFocus
                aria-invalid={(touched.name && !!errors.name) || undefined}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                onChange={(e) => setName(e.target.value)}
              />
              {touched.name && errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-email">Work email</Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                disabled={!!user}
                aria-invalid={(touched.email && !!errors.email) || undefined}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                onChange={(e) => setEmail(e.target.value)}
              />
              {touched.email && errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
          </div>

          {!user && (
            <div className="space-y-1.5">
              <Label htmlFor="user-password">First password</Label>
              <div className="flex gap-2">
                <Input
                  id="user-password"
                  value={password}
                  autoComplete="new-password"
                  spellCheck={false}
                  className="font-mono"
                  aria-invalid={(touched.password && !!errors.password) || undefined}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button type="button" variant="outline" size="icon" title="Make a new one" aria-label="Make a new password" onClick={() => setPassword(newPassword())}>
                  <RefreshCw />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Copy"
                  aria-label="Copy the password"
                  onClick={() => void navigator.clipboard.writeText(password).then(() => toast.success("Password copied"))}
                >
                  <Copy />
                </Button>
              </div>
              {touched.password && errors.password ? (
                <p className="text-xs text-destructive">{errors.password}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  At least 12 characters. If they already sign in to Lead Intel, they keep that password instead.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Role</p>
            <RolePicker
              value={role}
              onChange={setRole}
              disabled={(r) =>
                r === "admin"
                  ? undefined
                  : isSelf
                    ? "You can't remove your own admin access."
                    : lastAdmin
                      ? "They're the only active admin. Make someone else an admin first."
                      : undefined
              }
            />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Workspaces</legend>
            {!allWorkspaces && (
              <p className="text-[13px] text-muted-foreground">
                {demoting
                  ? `${user?.name} will only be able to open the workspaces you tick. Everything else is hidden from them.`
                  : `${ROLE_LABEL[role]} users only see the workspaces ticked here.`}
              </p>
            )}
            {allWorkspaces ? (
              <p className="text-[13px] text-muted-foreground">Admins can open every workspace, including ones created later.</p>
            ) : (
              <>
                <div className="divide-y divide-rule rounded-md border">
                  {workspaces.map((w) => (
                    <label key={w.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50">
                      <Checkbox checked={workspaceIds.includes(w.id)} onCheckedChange={(v) => toggleWorkspace(w.id, v === true)} />
                      <span className="min-w-0">
                        <span className="block text-sm">{w.name}</span>
                        {w.description && <span className="block truncate text-xs text-muted-foreground">{w.description}</span>}
                      </span>
                    </label>
                  ))}
                </div>
                {errors.workspaces && <p className="text-xs text-destructive">{errors.workspaces}</p>}
              </>
            )}
          </fieldset>

          {prospector && (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">What they can see</legend>
              <p className="text-[13px] text-muted-foreground">
                Prospectors see the ICPs, products and smart lists they make, and the ones ticked here. Without Can edit, they
                only use it. They also see the companies their own runs find and those in their lists.
              </p>
              {grantsLoaded ? (
                <ProspectorAccess workspaces={workspaces.filter((w) => workspaceIds.includes(w.id))} grants={grants} onChange={setGrants} />
              ) : (
                <p className="text-[13px] text-muted-foreground">Loading…</p>
              )}
            </fieldset>
          )}
        </form>
        {failure && <p className="text-sm text-destructive">{failure}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" disabled={saving || !grantsLoaded}>
            {user ? (saving ? "Saving…" : "Save changes") : saving ? "Adding…" : "Add user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A random 16-character password, without characters that are easy to misread (0/O, 1/l/I). */
function newPassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let out = ""
  while (out.length < 16) {
    // Bytes past the last whole multiple of the alphabet are skipped, so every character is equally likely.
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      if (b < 256 - (256 % chars.length) && out.length < 16) out += chars[b % chars.length]
    }
  }
  return out
}
