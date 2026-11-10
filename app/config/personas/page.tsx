"use client"

import { useState, type FormEvent } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { LoadError } from "@/components/config/load-error"
import { Page } from "@/components/config/shell"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { type Persona, addPersona, canManage, deletePersona, editPersona, errorText, fetchPersonas, useApi } from "@/lib/config-api"
import { useSession } from "@/lib/config-session"

export default function PersonasPage() {
  const { workspaceId, me } = useSession()
  const manager = canManage(me?.role)
  const personas = useApi(() => (workspaceId ? fetchPersonas(workspaceId) : Promise.resolve([])), [workspaceId])
  const [editing, setEditing] = useState<Persona | "new" | null>(null)
  const [removing, setRemoving] = useState<Persona | null>(null)
  const list = personas.data ?? []

  const remove = async () => {
    if (!workspaceId || !removing) return
    const p = removing
    try {
      await deletePersona(workspaceId, p.id)
      personas.setData(list.filter((x) => x.id !== p.id))
      toast.success(`Deleted ${p.name}`)
    } catch (e) {
      toast.error("Couldn't delete it", { description: errorText(e) })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <Page
      title="Personas"
      description="Who your emails are from: the name, title and signature people see. Give each mailbox one."
      actions={
        manager && (
          <Button onClick={() => setEditing("new")}>
            <Plus /> Add a persona
          </Button>
        )
      }
    >
      {personas.error && !personas.data ? (
        <LoadError message={personas.error} onRetry={personas.reload} />
      ) : !personas.data ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <section className="rounded-xl border bg-card px-6 py-12 text-center">
          <p className="text-[15px] font-semibold">No personas yet</p>
          <p className="mx-auto mt-1 max-w-[48ch] text-[13.5px] text-muted-foreground">
            A persona is the person an email comes from, like &quot;Sarah Lane, Partnerships&quot;, with the signature under every email.
          </p>
          {manager && (
            <Button className="mt-5" onClick={() => setEditing("new")}>
              <Plus /> Add a persona
            </Button>
          )}
        </section>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map((p) => (
            <li key={p.id} className="flex flex-col rounded-xl border bg-card">
              <div className="flex items-start justify-between gap-3 px-5 pt-4">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">{p.name}</p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {[p.title, `${p.senders} ${p.senders === 1 ? "mailbox" : "mailboxes"}`].filter(Boolean).join(", ")}
                  </p>
                </div>
                {manager && (
                  <div className="flex flex-none gap-1">
                    <Button variant="ghost" size="icon" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Delete ${p.name}`} onClick={() => setRemoving(p)}>
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>
              <pre className="mx-5 mt-3 mb-5 flex-1 rounded-md bg-muted/60 px-3.5 py-3 font-sans text-[13px] leading-5 whitespace-pre-wrap text-foreground/85">
                {p.signature || <span className="text-muted-foreground">No signature yet.</span>}
              </pre>
            </li>
          ))}
        </ul>
      )}

      {editing && workspaceId && (
        <PersonaDialog
          wsId={workspaceId}
          persona={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(p) => {
            personas.setData(list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p].sort((a, b) => a.name.localeCompare(b.name)))
            setEditing(null)
          }}
        />
      )}

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.senders
                ? `Its ${removing.senders} ${removing.senders === 1 ? "mailbox stays" : "mailboxes stay"}, with no persona until you pick another.`
                : "No mailbox uses it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void remove()}>
              Delete {removing?.name}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  )
}

function PersonaDialog({ wsId, persona, onClose, onSaved }: { wsId: string; persona: Persona | null; onClose: () => void; onSaved: (p: Persona) => void }) {
  const [name, setName] = useState(persona?.name ?? "")
  const [title, setTitle] = useState(persona?.title ?? "")
  const [signature, setSignature] = useState(persona?.signature ?? "")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) return setError("Enter the name people see.")
    setBusy(true)
    try {
      const body = { name: name.trim(), title: title.trim(), signature }
      const saved = persona ? await editPersona(wsId, persona.id, body) : await addPersona(wsId, body)
      toast.success(persona ? `Saved ${saved.name}` : `Added ${saved.name}`)
      onSaved(saved)
    } catch (err) {
      toast.error(persona ? "Couldn't save it" : "Couldn't add it", { description: errorText(err) })
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} noValidate className="space-y-5">
          <DialogHeader>
            <DialogTitle>{persona ? `Edit ${persona.name}` : "Add a persona"}</DialogTitle>
            <DialogDescription>The sender people see. Its signature goes under every email from its mailboxes.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="persona-name">Name</Label>
              <Input id="persona-name" value={name} onChange={(e) => (setName(e.target.value), setError(null))} aria-invalid={!!error} />
              {error && (
                <p className="text-[12.5px] text-negative" role="alert">
                  {error}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="persona-title">Title</Label>
              <Input id="persona-title" placeholder="Partnerships" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="persona-signature">Signature</Label>
            <Textarea id="persona-signature" rows={5} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={"Sarah Lane\nPartnerships, AheadTech360"} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : persona ? "Save changes" : "Add persona"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
