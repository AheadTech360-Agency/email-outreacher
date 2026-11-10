"use client"

import { useState, type FormEvent, type ReactNode } from "react"
import { ChevronDown, LockKeyhole } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { type Persona, type Pool, type Security, type Sender, type SenderInput, addSender, editSender, errorText, testSender } from "@/lib/config-api"
import { PROVIDERS, providerOf, securityFor } from "@/lib/config-providers"
import { cn } from "@/lib/utils"

interface Form {
  provider: string
  fromEmail: string
  fromName: string
  label: string
  personaId: string
  smtpUsername: string
  smtpPassword: string
  smtpHost: string
  smtpPort: string
  smtpSecurity: Security
  readReplies: boolean
  sameLogin: boolean
  imapUsername: string
  imapPassword: string
  imapHost: string
  imapPort: string
  imapSecurity: Security
  dailyLimit: string
  pool: Pool
  warmupDailyTarget: string
  warmupReplyPercent: string
}

export interface SheetDefaults {
  dailyLimit: number
  warmupTarget: number
  replyPercent: number
}

function initial(sender: Sender | null, pool: Pool, d: SheetDefaults): Form {
  if (!sender) {
    const p = PROVIDERS[0]
    return {
      provider: p.id, fromEmail: "", fromName: "", label: "", personaId: "none", smtpUsername: "", smtpPassword: "",
      smtpHost: p.smtp.host, smtpPort: String(p.smtp.port), smtpSecurity: p.smtp.security, readReplies: true, sameLogin: true,
      imapUsername: "", imapPassword: "", imapHost: p.imap?.host ?? "", imapPort: String(p.imap?.port ?? 993),
      imapSecurity: p.imap?.security ?? "ssl", dailyLimit: String(d.dailyLimit), pool, warmupDailyTarget: String(d.warmupTarget),
      warmupReplyPercent: String(d.replyPercent),
    }  // prettier-ignore
  }
  const same = !sender.imapUsername || sender.imapUsername === sender.smtpUsername
  return {
    provider: sender.provider, fromEmail: sender.fromEmail, fromName: sender.fromName, label: sender.label,
    personaId: sender.personaId ?? "none", smtpUsername: sender.smtpUsername, smtpPassword: "", smtpHost: sender.smtpHost,
    smtpPort: String(sender.smtpPort), smtpSecurity: sender.smtpSecurity, readReplies: !!sender.imapHost, sameLogin: same,
    imapUsername: sender.imapUsername ?? "", imapPassword: "", imapHost: sender.imapHost ?? providerOf(sender.provider).imap?.host ?? "",
    imapPort: String(sender.imapPort ?? 993), imapSecurity: sender.imapSecurity ?? "ssl", dailyLimit: String(sender.dailyLimit),
    pool: sender.pool, warmupDailyTarget: String(sender.warmupDailyTarget), warmupReplyPercent: String(sender.warmupReplyPercent),
  }  // prettier-ignore
}

type Errors = Partial<Record<keyof Form, string>>

function check(f: Form, editing: Sender | null): Errors {
  const e: Errors = {}
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.fromEmail.trim())) e.fromEmail = "Enter the mailbox's email address."
  if (!editing && !f.smtpPassword) e.smtpPassword = "Enter the password to send with."
  if (!/^[A-Za-z0-9.-]+$/.test(f.smtpHost.trim())) e.smtpHost = "Enter the SMTP server, like smtp.example.com."
  const port = Number(f.smtpPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) e.smtpPort = "A port from 1 to 65535."
  if (f.readReplies) {
    if (!/^[A-Za-z0-9.-]+$/.test(f.imapHost.trim())) e.imapHost = "Enter the IMAP server, like imap.example.com."
    const imapPort = Number(f.imapPort)
    if (!Number.isInteger(imapPort) || imapPort < 1 || imapPort > 65535) e.imapPort = "A port from 1 to 65535."
    if (!f.sameLogin && !f.imapUsername.trim()) e.imapUsername = "Enter the IMAP username."
    if (!f.sameLogin && !f.imapPassword && !editing?.imapPasswordSet) e.imapPassword = "Enter the IMAP password."
  }
  const limit = Number(f.dailyLimit)
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) e.dailyLimit = "A whole number from 1 to 500."
  const target = Number(f.warmupDailyTarget)
  if (!Number.isInteger(target) || target < 1 || target > 100) e.warmupDailyTarget = "A whole number from 1 to 100."
  const reply = Number(f.warmupReplyPercent)
  if (!Number.isInteger(reply) || reply < 0 || reply > 100) e.warmupReplyPercent = "A percentage from 0 to 100."
  if (f.pool === "warming" && !f.readReplies) e.imapHost = "A warming mailbox needs reading turned on: it opens and replies to warm-up emails."
  return e
}

function toInput(f: Form): SenderInput {
  const username = f.smtpUsername.trim() || f.fromEmail.trim()
  return {
    label: f.label.trim(), fromName: f.fromName.trim(), fromEmail: f.fromEmail.trim(), provider: f.provider,
    personaId: f.personaId === "none" ? null : f.personaId, smtpHost: f.smtpHost.trim(), smtpPort: Number(f.smtpPort),
    smtpSecurity: f.smtpSecurity, smtpUsername: username, smtpPassword: f.smtpPassword || null,
    imapHost: f.readReplies ? f.imapHost.trim() : null, imapPort: f.readReplies ? Number(f.imapPort) : null,
    imapSecurity: f.readReplies ? f.imapSecurity : null,
    imapUsername: f.readReplies ? (f.sameLogin ? username : f.imapUsername.trim()) : null,
    imapPassword: f.readReplies ? (f.sameLogin ? f.smtpPassword || null : f.imapPassword || null) : null,
    dailyLimit: Number(f.dailyLimit), pool: f.pool, warmupDailyTarget: Number(f.warmupDailyTarget),
    warmupReplyPercent: Number(f.warmupReplyPercent),
  }  // prettier-ignore
}

/** Add a mailbox, or change one. Saving tests it straight away: it signs in, nothing is sent. */
export function SenderSheet({
  wsId,
  sender,
  personas,
  pool = "sending",
  defaults = { dailyLimit: 30, warmupTarget: 20, replyPercent: 30 },
  onClose,
  onSaved,
}: {
  wsId: string
  sender: Sender | null
  personas: Persona[]
  /** The pool a new mailbox joins: the page it's added from. */
  pool?: Pool
  /** A new mailbox's starting numbers: the workspace's Settings. */
  defaults?: SheetDefaults
  onClose: () => void
  onSaved: (s: Sender) => void
}) {
  const [f, setF] = useState<Form>(() => initial(sender, pool, defaults))
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [serverOpen, setServerOpen] = useState(() => (sender ? sender.provider === "custom" : false))
  const provider = providerOf(f.provider)
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setF((cur) => ({ ...cur, [key]: value }))
    if (errors[key]) setErrors((cur) => ({ ...cur, [key]: undefined }))
  }

  const pickProvider = (id: string) => {
    const p = providerOf(id)
    setF((cur) => ({
      ...cur,
      provider: id,
      smtpHost: p.smtp.host,
      smtpPort: String(p.smtp.port),
      smtpSecurity: p.smtp.security,
      imapHost: p.imap?.host ?? "",
      imapPort: String(p.imap?.port ?? 993),
      imapSecurity: p.imap?.security ?? "ssl",
    }))
    setServerOpen(id === "custom")
    setErrors({})
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const found = check(f, sender)
    setErrors(found)
    if (Object.keys(found).length) {
      if (found.smtpHost || found.smtpPort || found.imapHost || found.imapPort) setServerOpen(true)
      return
    }
    setBusy(true)
    try {
      const saved = sender ? await editSender(wsId, sender.id, toInput(f)) : await addSender(wsId, toInput(f))
      const checking = toast.loading(`Saved ${saved.fromEmail}. Checking the connection…`)
      try {
        const r = await testSender(wsId, saved.id)
        if (r.ok) toast.success(`${saved.fromEmail} is connected`, { id: checking, description: r.imapChecked ? "Sending and reading replies both work." : "Sending works." })
        else toast.error(`${saved.fromEmail} can't connect yet`, { id: checking, description: [r.smtpError, r.imapError].filter(Boolean).join(" ") })
        onSaved(r.account)
      } catch (err) {
        toast.error(`Saved ${saved.fromEmail}, but the check didn't run`, { id: checking, description: errorText(err) })
        onSaved(saved)
      }
    } catch (err) {
      toast.error(sender ? "Couldn't save the changes" : "Couldn't add the mailbox", { description: errorText(err) })
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && !busy && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl!">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle className="text-[17px]">{sender ? `Edit ${sender.fromEmail}` : pool === "warming" ? "Add a warming mailbox" : "Add a sending mailbox"}</SheetTitle>
          <SheetDescription>
            {sender ? "Change any detail. Leave a password empty to keep the saved one." : "Coldbrew sends from it and reads its replies. Passwords are encrypted and never shown again."}
          </SheetDescription>
        </SheetHeader>

        <form id="sender-form" onSubmit={submit} noValidate className="flex-1 space-y-8 overflow-y-auto px-6 py-6">
          <fieldset className="space-y-2.5">
            <legend className="mb-2.5 text-[13px] font-medium">Mail provider</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Mail provider">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={f.provider === p.id}
                  onClick={() => pickProvider(p.id)}
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-left text-[13px] leading-[18px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    f.provider === p.id ? "border-primary bg-accent font-medium text-accent-foreground" : "hover:bg-muted",
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </fieldset>

          <Section title="Who it's from">
            <Field id="fromEmail" label="Email address" error={errors.fromEmail}>
              <Input id="fromEmail" type="email" autoComplete="off" placeholder="sarah@yourdomain.com" value={f.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} aria-invalid={!!errors.fromEmail} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="fromName" label="Display name" hint="What people see as the sender. Empty uses the persona's name.">
                <Input id="fromName" value={f.fromName} onChange={(e) => set("fromName", e.target.value)} />
              </Field>
              <Field id="persona" label="Persona">
                <Select value={f.personaId} onValueChange={(v) => set("personaId", v)}>
                  <SelectTrigger id="persona" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No persona</SelectItem>
                    {personas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          <Section title="Sending">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="smtpUsername" label="Username" hint="Usually the email address.">
                <Input id="smtpUsername" autoComplete="off" placeholder={f.fromEmail || "Same as the email address"} value={f.smtpUsername} onChange={(e) => set("smtpUsername", e.target.value)} />
              </Field>
              <PasswordField id="smtpPassword" label="Password" saved={!!sender?.smtpPasswordSet} value={f.smtpPassword} error={errors.smtpPassword} onChange={(v) => set("smtpPassword", v)} />
            </div>
            <p className="text-[12.5px] leading-[18px] text-muted-foreground">{provider.passwordHint}</p>
            <button
              type="button"
              aria-expanded={serverOpen}
              onClick={() => setServerOpen(!serverOpen)}
              className="flex items-center gap-1.5 text-[13px] font-medium text-foreground outline-none hover:underline focus-visible:underline"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", serverOpen && "rotate-180")} />
              Server settings
              {!serverOpen && f.smtpHost && <span className="font-normal text-muted-foreground">{f.smtpHost}, port {f.smtpPort}</span>}
            </button>
            {serverOpen && (
              <ServerFields
                prefix="smtp"
                host={f.smtpHost}
                port={f.smtpPort}
                security={f.smtpSecurity}
                errors={{ host: errors.smtpHost, port: errors.smtpPort }}
                onHost={(v) => set("smtpHost", v)}
                onPort={(v) => setF((cur) => ({ ...cur, smtpPort: v, smtpSecurity: securityFor(Number(v)) }))}
                onSecurity={(v) => set("smtpSecurity", v)}
              />
            )}
          </Section>

          <Section
            title="Reading replies"
            aside={<Switch id="readReplies" checked={f.readReplies} onCheckedChange={(v) => set("readReplies", v)} aria-label="Read replies from this mailbox" />}
          >
            {f.readReplies ? (
              <>
                <p className="text-[13px] text-muted-foreground">Coldbrew checks this inbox, spam included, for replies, bounces and unsubscribes.</p>
                <label className="flex items-center gap-2.5 text-[13.5px]">
                  <Switch checked={f.sameLogin} onCheckedChange={(v) => set("sameLogin", v)} />
                  Same username and password as sending
                </label>
                {!f.sameLogin && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field id="imapUsername" label="IMAP username" error={errors.imapUsername}>
                      <Input id="imapUsername" autoComplete="off" value={f.imapUsername} onChange={(e) => set("imapUsername", e.target.value)} aria-invalid={!!errors.imapUsername} />
                    </Field>
                    <PasswordField id="imapPassword" label="IMAP password" saved={!!sender?.imapPasswordSet} value={f.imapPassword} error={errors.imapPassword} onChange={(v) => set("imapPassword", v)} />
                  </div>
                )}
                {serverOpen && (
                  <ServerFields
                    prefix="imap"
                    host={f.imapHost}
                    port={f.imapPort}
                    security={f.imapSecurity}
                    errors={{ host: errors.imapHost, port: errors.imapPort }}
                    onHost={(v) => set("imapHost", v)}
                    onPort={(v) => setF((cur) => ({ ...cur, imapPort: v, imapSecurity: securityFor(Number(v)) }))}
                    onSecurity={(v) => set("imapSecurity", v)}
                  />
                )}
              </>
            ) : (
              <p className="text-[13px] text-muted-foreground">Off: replies to this mailbox won&apos;t stop its leads&apos; follow-ups. Turn it on unless replies are read elsewhere.</p>
            )}
          </Section>

          {f.pool === "warming" ? (
            <Section title="Warm-up">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="warmupDailyTarget" label="Warm-up emails a day" error={errors.warmupDailyTarget}
                       hint="It starts at 3 a day and adds 2 a day until it reaches this.">
                  <Input id="warmupDailyTarget" inputMode="numeric" value={f.warmupDailyTarget}
                         onChange={(e) => set("warmupDailyTarget", e.target.value.replace(/\D/g, ""))} aria-invalid={!!errors.warmupDailyTarget} />
                </Field>
                <Field id="warmupReplyPercent" label="Reply to (%)" error={errors.warmupReplyPercent} hint="The share of warm-up emails it receives that it answers.">
                  <Input id="warmupReplyPercent" inputMode="numeric" value={f.warmupReplyPercent}
                         onChange={(e) => set("warmupReplyPercent", e.target.value.replace(/\D/g, ""))} aria-invalid={!!errors.warmupReplyPercent} />
                </Field>
                <Field id="label" label="Note" hint="Only you see it, e.g. new domain, November.">
                  <Input id="label" value={f.label} onChange={(e) => set("label", e.target.value)} />
                </Field>
              </div>
            </Section>
          ) : (
            <Section title="Daily limit">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="dailyLimit" label="Emails a day" error={errors.dailyLimit} hint="Start a new mailbox low and raise it as it warms up.">
                  <Input id="dailyLimit" inputMode="numeric" value={f.dailyLimit} onChange={(e) => set("dailyLimit", e.target.value.replace(/\D/g, ""))} aria-invalid={!!errors.dailyLimit} />
                </Field>
                <Field id="label" label="Note" hint="Only you see it, e.g. warm-up batch 2.">
                  <Input id="label" value={f.label} onChange={(e) => set("label", e.target.value)} />
                </Field>
              </div>
            </Section>
          )}
        </form>

        <SheetFooter className="flex-row justify-end gap-2 border-t px-6 py-4">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="sender-form" disabled={busy}>
            {busy ? "Saving…" : sender ? "Save changes" : "Add mailbox"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4 border-t pt-6 first-of-type:border-t-0 first-of-type:pt-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-[12.5px] text-negative" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-[12.5px] leading-[18px] text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

function PasswordField({ id, label, saved, value, error, onChange }: { id: string; label: string; saved: boolean; value: string; error?: string; onChange: (v: string) => void }) {
  return (
    <Field id={id} label={label} error={error}>
      <div className="relative">
        <Input
          id={id}
          type="password"
          autoComplete="new-password"
          placeholder={saved ? "Saved. Type to replace it" : ""}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          className={cn(saved && "pl-8")}
        />
        {saved && <LockKeyhole className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />}
      </div>
    </Field>
  )
}

function ServerFields({
  prefix,
  host,
  port,
  security,
  errors,
  onHost,
  onPort,
  onSecurity,
}: {
  prefix: "smtp" | "imap"
  host: string
  port: string
  security: Security
  errors: { host?: string; port?: string }
  onHost: (v: string) => void
  onPort: (v: string) => void
  onSecurity: (v: Security) => void
}) {
  const name = prefix.toUpperCase()
  return (
    <div className="grid gap-4 rounded-md bg-muted/60 p-4 sm:grid-cols-[minmax(0,1fr)_88px_120px]">
      <Field id={`${prefix}Host`} label={`${name} server`} error={errors.host}>
        <Input id={`${prefix}Host`} autoComplete="off" value={host} onChange={(e) => onHost(e.target.value)} aria-invalid={!!errors.host} />
      </Field>
      <Field id={`${prefix}Port`} label="Port" error={errors.port}>
        <Input id={`${prefix}Port`} inputMode="numeric" value={port} onChange={(e) => onPort(e.target.value.replace(/\D/g, ""))} aria-invalid={!!errors.port} />
      </Field>
      <Field id={`${prefix}Security`} label="Security">
        <Select value={security} onValueChange={(v) => onSecurity(v as Security)}>
          <SelectTrigger id={`${prefix}Security`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ssl">SSL</SelectItem>
            <SelectItem value="starttls">STARTTLS</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>
  )
}
