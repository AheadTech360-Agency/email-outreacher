"use client"

import { useState } from "react"
import { Download, FileUp, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { EnrichChoices, NO_ENRICH } from "@/components/enrich-dialog"
import { ImportProgress, ImportSummary } from "@/components/people/import-progress"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  type ApiIcp,
  type PeopleImportResult,
  type PersonInput,
  downloadTemplate,
  addPerson,
  importPeople,
  importPeopleRun,
  type ImportRunResult,
  type Job,
} from "@/lib/api"
import { useAuth } from "@/lib/auth"
import { formatUsd } from "@/lib/format"
import { MANAGERS_ONLY_HINT, canManage } from "@/lib/roles"
import { cn } from "@/lib/utils"

const NO_ICP = "__none__"
const FIELD_LABEL: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  title: "Title",
  company: "Company",
  email: "Email",
  email_status: "Email status",
  seniority: "Seniority",
  linkedin_url: "LinkedIn",
  website: "Website",
  company_linkedin_url: "Company LinkedIn",
  facebook_url: "Facebook",
  twitter_url: "X",
  city: "City",
  state: "State",
  country: "Country",
  phone: "Phone",
  apollo_contact_id: "Apollo id",
  apollo_account_id: "Apollo company id",
}

function IcpPicker({ icps, value, onChange, id }: { icps: ApiIcp[]; value: string; onChange: (v: string) => void; id: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>ICP</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full!">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_ICP}>Their company&apos;s ICP, if it&apos;s in the pipeline</SelectItem>
          {icps.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {i.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">Emails are written with this ICP&apos;s prompts and notes.</p>
    </div>
  )
}

/** Add one person by hand. With an email or LinkedIn URL they become a lead straight away. */
export function AddPersonDialog({
  workspaceId,
  icps,
  onClose,
  onAdded,
}: {
  workspaceId: string
  icps: ApiIcp[]
  onClose: () => void
  onAdded: () => void
}) {
  const [icp, setIcp] = useState(NO_ICP)
  const [form, setForm] = useState<Omit<PersonInput, "icpId">>({
    firstName: "",
    lastName: "",
    title: "",
    company: "",
    email: "",
    linkedinUrl: "",
    website: "",
  })
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const missingName = !form.firstName.trim() && !form.lastName.trim()
  const missingContact = !form.email.trim() && !form.linkedinUrl.trim() && !form.company.trim() && !form.website.trim()

  const save = async () => {
    setTouched(true)
    if (missingName || missingContact) return
    setBusy(true)
    try {
      const r = await addPerson(workspaceId, { ...form, icpId: icp === NO_ICP ? null : icp })
      toast.success(r.new ? `Added ${form.firstName || form.lastName}` : `Updated ${form.firstName || form.lastName}`, {
        description:
          [r.leadCreated ? "Now a lead." : "", r.companyName ? `Linked to ${r.companyName}.` : ""].filter(Boolean).join(" ") ||
          undefined,
      })
      onAdded()
      onClose()
    } catch (e) {
      toast.error("Couldn't add them", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  const field = (key: keyof typeof form, label: string, placeholder = "", type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={`person-${key}`}>{label}</Label>
      <Input id={`person-${key}`} type={type} placeholder={placeholder} value={form[key]} onChange={set(key)} />
    </div>
  )

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg!">
        <DialogHeader>
          <DialogTitle>Add a person</DialogTitle>
          <DialogDescription>
            With an email or a LinkedIn URL they become a lead straight away. They&apos;re linked to their company if it&apos;s in
            the pipeline (same website or name).
          </DialogDescription>
        </DialogHeader>
        <form
          id="add-person"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {field("firstName", "First name")}
            {field("lastName", "Last name")}
            {field("title", "Title", "Owner")}
            {field("company", "Company")}
            {field("email", "Email", "", "email")}
            {field("website", "Company website", "company.com")}
          </div>
          {field("linkedinUrl", "LinkedIn URL", "linkedin.com/in/…")}
          <IcpPicker icps={icps} value={icp} onChange={setIcp} id="person-icp" />
          {touched && missingName && <p className="text-sm text-destructive">Add a first or last name.</p>}
          {touched && missingContact && <p className="text-sm text-destructive">Add an email, a LinkedIn URL, a company or a website.</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="add-person" disabled={busy}>
            <UserPlus /> {busy ? "Adding…" : "Add person"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Import people from a CSV in Apollo's export format: preview first, then import. */
export function ImportPeopleDialog({
  workspaceId,
  icps,
  onClose,
  onImported,
}: {
  workspaceId: string
  icps: ApiIcp[]
  onClose: () => void
  onImported: () => void
}) {
  const [icp, setIcp] = useState(NO_ICP)
  const [file, setFile] = useState<{ name: string; text: string } | null>(null)
  const [preview, setPreview] = useState<PeopleImportResult | null>(null)
  const [failure, setFailure] = useState("")
  const [busy, setBusy] = useState("")
  const { me } = useAuth()
  const manager = canManage(me?.role)
  const [sort, setSort] = useState(manager)
  const [fill, setFill] = useState(NO_ENRICH)
  const [job, setJob] = useState<Job | null>(null)
  const [result, setResult] = useState<ImportRunResult | null>(null)
  const icpId = icp === NO_ICP ? null : icp

  const check = async (text: string) => {
    setBusy("check")
    setFailure("")
    setPreview(null)
    try {
      setPreview(await importPeople(workspaceId, text, icpId, true))
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "The file couldn't be read.")
    } finally {
      setBusy("")
    }
  }

  const pick = async (f: File | undefined) => {
    if (!f) return
    const text = await f.text()
    setFile({ name: f.name, text })
    void check(text)
  }

  const run = async () => {
    if (!file || !preview) return
    setBusy("import")
    setJob(null)
    const sorting = sort && manager
    try {
      const r = await importPeopleRun(workspaceId, file.text, icpId, sorting, setJob, manager
        ? { website: fill.website, instagram: fill.instagram, linkedin: fill.linkedin, peopleLinkedin: fill.people }
        : undefined)
      setResult(r)
      onImported()
    } catch (e) {
      toast.error("Couldn't import them", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy("")
    }
  }

  // Claude reads each person (and their company) briefly: about $0.06 per 1,000 rows, from the sorting prompt's size.
  const estimate = preview ? preview.valid * 0.00006 : 0

  const unused = preview ? Object.keys(FIELD_LABEL).filter((f) => !Object.values(preview.columns).includes(f)) : []

  return (
    <Dialog open onOpenChange={(o) => !o && busy !== "check" && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl!">
        <DialogHeader>
          <DialogTitle>Import people from a CSV</DialogTitle>
          <DialogDescription>
            Use Apollo&apos;s people export as it is, or the template, which has the same columns. Anyone with an email or a
            LinkedIn URL becomes a lead. People already here (same Apollo id, LinkedIn or email) are updated, not added twice.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <ImportSummary r={result} />
        ) : busy === "import" ? (
          <ImportProgress
            job={job}
            sorting={sort && manager}
            enriching={manager ? [
              fill.website && "Reading websites", fill.instagram && "Reading Instagram profiles",
              fill.linkedin && "Reading LinkedIn company pages", fill.people && "Reading LinkedIn profiles",
            ].filter((x): x is string => !!x) : []}
            rows={preview?.valid ?? 0}
          />
        ) : (
        <div className="space-y-4">
          <Button variant="outline" size="sm" onClick={() => void downloadTemplate("people").catch((e) => toast.error(e.message))}>
            <Download /> Download the template
          </Button>
          <IcpPicker icps={icps} value={icp} onChange={setIcp} id="import-icp" />
          <div className="space-y-1.5">
            <Label htmlFor="import-file">CSV file</Label>
            <Input id="import-file" type="file" accept=".csv,text/csv" onChange={(e) => void pick(e.target.files?.[0])} />
          </div>

          {busy === "check" && <p className="text-sm text-muted-foreground">Reading {file?.name}…</p>}
          {failure && <p className="text-sm text-destructive">{failure}</p>}
          {preview && (
            <div className="space-y-2 rounded-md border px-3 py-3 text-sm">
              <p className="font-medium tabular-nums">
                {preview.valid} {preview.valid === 1 ? "person" : "people"} ready to import
                {preview.totalRows > preview.valid ? ` of ${preview.totalRows} rows` : ""}
              </p>
              <ul className="space-y-0.5 text-[13px] text-muted-foreground tabular-nums">
                <li>{preview.linkedToCompanies} match a company in the pipeline</li>
                {preview.duplicatesInFile > 0 && <li>{preview.duplicatesInFile} repeated in the file, imported once</li>}
                {preview.errors.length > 0 && <li>{preview.errors.length} rows can&apos;t be used (below)</li>}
              </ul>
              <p className="text-xs text-muted-foreground">
                Columns used: {Object.values(preview.columns).map((f) => FIELD_LABEL[f] ?? f).join(", ")}.
                {unused.includes("email") && unused.includes("linkedin_url")
                  ? " No email or LinkedIn column, so nobody becomes a lead yet."
                  : ""}{" "}
                Other columns are kept with each person.
              </p>
              {preview.errors.length > 0 && (
                <ul className="max-h-32 overflow-y-auto text-xs text-destructive">
                  {preview.errors.slice(0, 50).map((e) => (
                    <li key={e.row}>
                      Row {e.row}: {e.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {preview && preview.valid > 0 && manager && (
            <div className="space-y-2 rounded-md border px-3 py-3">
              <p className="text-sm font-medium">Fill them in (each one optional)</p>
              <p className="text-xs text-muted-foreground">
                Imported companies count as verified, so nothing is judged again. Up to {preview.valid.toLocaleString()} companies.
              </p>
              <EnrichChoices companies={preview.valid} people={preview.valid} value={fill} onChange={setFill} />
            </div>
          )}
          {preview && preview.valid > 0 && (
            <label className={cn("flex items-start gap-2 text-sm", !manager && "opacity-60")} title={manager ? undefined : MANAGERS_ONLY_HINT}>
              <Checkbox className="mt-0.5" checked={sort && manager} disabled={!manager} onCheckedChange={(v) => setSort(v === true)} />
              <span>
                Sort them into ICPs and Smart Lists with Claude after importing
                <span className="block text-xs text-muted-foreground">
                  Each company goes under the ICP it fits, or a draft ICP if none does. About {formatUsd(estimate)}, logged on Usage.
                  The prompt is editable on Prompts.
                </span>
              </span>
            </label>
          )}
        </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>Done</Button>
          ) : busy === "import" ? (
            <Button variant="outline" onClick={onClose}>
              Close, keep it running
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={!!busy}>
                Cancel
              </Button>
              <Button disabled={!preview || preview.valid === 0 || !!busy} onClick={() => void run()}>
                <FileUp /> {preview ? `Import ${preview.valid.toLocaleString()}` : "Import"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
