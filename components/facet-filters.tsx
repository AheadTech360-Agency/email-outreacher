"use client"
import { useId, useState } from "react"
import { SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
export interface FacetField { key: string; label: string; type?: "text"; options?: { value: string; label: string }[]; placeholder?: string }
export function FacetFilters({ label = "More filters", fields, values, onChange, count }: {
  label?: string; fields: FacetField[]; values: Record<string, string>; onChange: (values: Record<string, string>) => void; count: number
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const active = fields.filter((field) => values[field.key] && values[field.key] !== "all").length
  return <section className="contents" aria-label={label}>
    <Button variant={active ? "secondary" : "ghost"} size="sm" aria-expanded={open} onClick={() => setOpen(!open)}><SlidersHorizontal /> {label}{active ? ` (${active})` : ""}</Button>
    {active > 0 && <Button variant="ghost" size="sm" onClick={() => onChange(Object.fromEntries(Object.entries(values).filter(([key]) => !fields.some((field) => field.key === key))))}>Clear</Button>}
    <span role="status" className="text-xs text-muted-foreground tabular-nums">{count.toLocaleString()} matching</span>
    {open && <div className="grid w-full basis-full gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2 xl:grid-cols-3">{fields.map((field) => <div key={field.key} className="space-y-1.5">
      <Label htmlFor={`${id}-${field.key}`} className="text-xs">{field.label}</Label>
      {field.type === "text" ? <Input id={`${id}-${field.key}`} aria-label={field.label} placeholder={field.placeholder ?? field.label} value={values[field.key] ?? ""} onChange={(e) => onChange({...values,[field.key]:e.target.value})} /> :
        <Select value={values[field.key] ?? "all"} onValueChange={(value) => onChange({...values,[field.key]:value})}><SelectTrigger id={`${id}-${field.key}`} className="w-full" aria-label={field.label}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Any {field.label.toLowerCase()}</SelectItem>{(field.options ?? []).filter((o) => o.value !== "all").map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>}
    </div>)}</div>}
  </section>
}
