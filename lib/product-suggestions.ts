import type {ProductFields, ProductCustomField, ProductNote} from "./api"
export const PRODUCT_BASE_FIELDS = ["name","description","value","proof","offer","cta","url"] as const
export type ProductBaseKey = typeof PRODUCT_BASE_FIELDS[number]
export interface ProductChange {
  id: string
  type: "base" | "custom" | "note"
  key: string
  label: string
  before: string | ProductCustomField | ProductNote | null
  after: string | ProductCustomField | ProductNote | null
}
export function productChanges(before: ProductFields, after: ProductFields): ProductChange[] {
  const changes: ProductChange[] = []
  for (const key of PRODUCT_BASE_FIELDS) if (before[key] !== after[key]) changes.push({id:key,type:"base",key,label:key,before:before[key],after:after[key]})
  for (const type of ["custom","note"] as const) {
    const oldItems = type === "custom" ? before.customFields : before.notes
    const newItems = type === "custom" ? after.customFields : after.notes
    const itemKey = (value:ProductCustomField|ProductNote) => "key" in value ? value.key : value.id
    const keys = new Set([...oldItems.map(itemKey),...newItems.map(itemKey)])
    for (const key of keys) {
      const oldValue = oldItems.find((value)=>itemKey(value)===key) ?? null
      const newValue = newItems.find((value)=>itemKey(value)===key) ?? null
      if (JSON.stringify(oldValue)===JSON.stringify(newValue)) continue
      const field = newValue ?? oldValue
      changes.push({id:`${type === "note" ? "notes" : "custom"}.${key}`,type,key,label:type === "custom" && field && "label" in field ? field.label : "Product note",before:oldValue,after:newValue})
    }
  }
  return changes
}
export function applyProductChanges(base: ProductFields, changes: ProductChange[]): ProductFields {
  const next = {...base,customFields:[...base.customFields],notes:[...base.notes]}
  for (const change of changes) {
    if (change.type === "base") next[change.key as ProductBaseKey] = change.after as string
    else if (change.type === "custom") {
      const index = next.customFields.findIndex((field)=>field.key===change.key)
      if (change.after === null) next.customFields = next.customFields.filter((field)=>field.key!==change.key)
      else if (index < 0) next.customFields.push(change.after as ProductCustomField)
      else next.customFields[index] = change.after as ProductCustomField
    } else {
      const index = next.notes.findIndex((note)=>note.id===change.key)
      if (change.after === null) next.notes = next.notes.filter((note)=>note.id!==change.key)
      else if (index < 0) next.notes.push(change.after as ProductNote)
      else next.notes[index] = change.after as ProductNote
    }
  }
  return next
}
export function productChangeText(value: ProductChange["before"]): string {
  if (value === null) return "(not present)"
  if (typeof value === "string") return value || "(empty)"
  return "key" in value ? `${value.label} ({{product.custom.${value.key}}})\n${value.value || "(empty)"}` : value.body
}
