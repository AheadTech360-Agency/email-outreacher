export const PRODUCT_RESERVED = new Set(["name", "description", "value", "proof", "offer", "cta", "url", "notes", "details", "custom", "custom_fields", "what_it_is", "what_it_does_for_them", "pricing", "pricing_or_offer", "call_to_action", "website", "product_name"])
export function productFieldKey(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") }
export function productFieldsError(fields: {key:string;label:string;value:string}[], notes:{id:string;body:string}[]): string {
  if (fields.length > 30 || notes.length > 20) return "Use up to 30 custom fields and 20 notes."
  const keys = new Set<string>(), labels = new Set<string>()
  for (const f of fields) {
    const label = productFieldKey(f.label)
    if (!label || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(f.key) || f.key.length > 60) return "Each field needs a name and a variable key starting with a letter, using lowercase letters, numbers and underscores."
    if (PRODUCT_RESERVED.has(f.key) || PRODUCT_RESERVED.has(label)) return `Field ?${f.label}? duplicates a built-in product field.`
    if (keys.has(f.key) || labels.has(label)) return `Redundant field ?${f.label}?: names and variable keys must be unique.`
    if (f.label.length > 80 || f.value.length > 4000) return "Field names must be at most 80 characters and values at most 4,000."
    keys.add(f.key); labels.add(label)
  }
  for (const f of fields) if (fields.some((other) => other !== f && productFieldKey(other.label) === f.key)) return "A field name duplicates another field's variable key."
  const bodies = new Set<string>(), ids = new Set<string>()
  for (const n of notes) {
    const body = n.body.trim().toLowerCase().replace(/\s+/g," ")
    if (!body) return "Write a note or remove the empty note before saving."
    if (n.body.length > 2000) return "Notes must be at most 2,000 characters each."
    if (bodies.has(body) || ids.has(n.id)) return "Redundant note: remove duplicate notes."
    bodies.add(body); ids.add(n.id)
  }
  if (fields.reduce((n,f)=>n+f.value.length,0)+notes.reduce((n,f)=>n+f.body.length,0)>24000) return "Custom fields and notes must total at most 24,000 characters."
  return ""
}
export const PRODUCT_SUGGESTIONS = [
  {key:"target_audience",label:"Target audience"}, {key:"features",label:"Key features"},
  {key:"differentiators",label:"Differentiators"}, {key:"use_cases",label:"Use cases"},
  {key:"objections",label:"Common objections and responses"},
]
