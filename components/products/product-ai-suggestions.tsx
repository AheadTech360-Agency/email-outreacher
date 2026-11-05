"use client"
import Link from "next/link"
import {useState} from "react"
import {Loader2, Sparkles} from "lucide-react"
import {toast} from "sonner"
import {ManagerOnly} from "@/components/manager-only"
import {Button} from "@/components/ui/button"
import {Checkbox} from "@/components/ui/checkbox"
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from "@/components/ui/dialog"
import {suggestProduct, type ProductFields, type ProductSuggestions} from "@/lib/api"
import {productFieldsError} from "@/lib/product-fields"
import {applyProductChanges,productChanges,productChangeText} from "@/lib/product-suggestions"

export function ProductAISuggestions({workspaceId,draft,disabled,onApply,onRunningChange}:{workspaceId:string;draft:ProductFields;disabled:boolean;onApply:(value:ProductFields)=>void;onRunningChange:(value:boolean)=>void}) {
  const [running,setRunning] = useState(false)
  const [progress,setProgress] = useState("")
  const [review,setReview] = useState<{base:ProductFields;result:ProductSuggestions}|null>(null)
  const [open,setOpen] = useState(false)
  const [selected,setSelected] = useState<Set<string>>(new Set())
  const changes = review ? productChanges(review.base,review.result.product) : []
  const next = review ? applyProductChanges(review.base,changes.filter((change)=>selected.has(change.id))) : null
  const error = next ? productFieldsError(next.customFields,next.notes) || (!next.name.trim() ? "A product name is required." : "") : ""
  const stale = !!review && JSON.stringify(draft)!==JSON.stringify(review.base)
  const run = async () => {
    setRunning(true);onRunningChange(true);setProgress("Starting suggestions...")
    const base = structuredClone(draft)
    try {
      const result = await suggestProduct(workspaceId,base,(job)=>setProgress(job.step || job.label))
      setReview({base,result});setSelected(new Set());setOpen(true)
    } catch(e) {toast.error("Could not suggest product changes",{description:e instanceof Error?e.message:undefined})}
    finally {setRunning(false);onRunningChange(false);setProgress("")}
  }
  return <section className="space-y-2 rounded-md border bg-muted/30 p-3">
    <div className="flex flex-wrap items-center gap-2"><ManagerOnly><Button type="button" variant="outline" disabled={disabled || running} onClick={()=>void run()}>{running?<Loader2 className="animate-spin"/>:<Sparkles/>} AI suggestions</Button></ManagerOnly>{review && <Button type="button" size="sm" variant="ghost" disabled={running} onClick={()=>setOpen(true)}>Review suggestions ({changes.length})</Button>}<Link href="/prompts" target="_blank" rel="noreferrer" className="ml-auto text-xs underline">Edit suggestion prompt</Link></div>
    <p className="text-xs text-muted-foreground">Reviews all current fields and notes. Generates suggestions using the workspace default prompt and incurs AI usage. Nothing is changed without your approval.</p>
    {running && <p role="status" className="text-xs">{progress}</p>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Review product suggestions</DialogTitle><DialogDescription>Choose individual changes to apply to the editor, then save the product separately. Deletions are never selected automatically.</DialogDescription></DialogHeader>
      {review && <><p className="text-sm">{review.result.summary}</p><p className="text-xs text-muted-foreground">Prompt version {review.result.promptVersion} | ${review.result.costUsd.toFixed(4)} | <Link href={`/prompts/${review.result.promptId}`} target="_blank" rel="noreferrer" className="underline">Edit prompt</Link></p></>}
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={()=>setSelected(new Set(changes.filter((change)=>change.after!==null).map((change)=>change.id)))}>Select additions and edits</Button><Button type="button" size="sm" variant="ghost" onClick={()=>setSelected(new Set())}>Clear selection</Button></div>
      {!changes.length && <p className="text-sm text-muted-foreground">No changes suggested.</p>}
      <div className="space-y-3">{changes.map((change)=>{
        const reason = review?.result.reasons.find((item)=>item.target===change.id)?.reason
        return <section key={change.id} className="space-y-2 rounded-md border p-3"><div className="flex items-center gap-2"><Checkbox id={`suggestion-${change.id}`} checked={selected.has(change.id)} onCheckedChange={(checked)=>setSelected((old)=>{const value=new Set(old);if(checked===true)value.add(change.id);else value.delete(change.id);return value})}/><label htmlFor={`suggestion-${change.id}`} className="cursor-pointer text-sm font-medium">{change.after===null?"Remove":change.before===null?"Add":"Update"}: {change.label}</label></div>
          {reason && <p className="text-xs text-muted-foreground">{reason}</p>}
          <div className="grid gap-3 sm:grid-cols-2"><div><p className="mb-1 text-xs font-medium">Current</p><pre className="whitespace-pre-wrap break-words rounded bg-muted p-2 font-sans text-xs">{productChangeText(change.before)}</pre></div><div><p className="mb-1 text-xs font-medium">Suggested</p><pre className="whitespace-pre-wrap break-words rounded bg-muted p-2 font-sans text-xs">{productChangeText(change.after)}</pre></div></div>
          {change.after===null && <p className="text-xs text-destructive">{change.type==="custom"?"Removing this field makes its prompt variable empty.":"Approve this deletion only if its useful information is preserved in the changes you selected."}</p>}
        </section>
      })}</div>
      {error && <p role="alert" className="text-sm text-destructive">Selected changes conflict: {error} Adjust your selection.</p>}
      {stale && <p role="alert" className="text-sm text-destructive">The product has changed since these suggestions were generated. Generate new suggestions before applying them.</p>}
      <DialogFooter><Button type="button" variant="outline" onClick={()=>setOpen(false)}>Close</Button><Button type="button" disabled={running || !selected.size || !!error || stale || disabled} onClick={()=>{if(next && !stale && !error){onApply(next);setReview(null);setSelected(new Set());setOpen(false);toast.success("Approved changes applied to the editor. Save the product to keep them.")}}}>Apply selected ({selected.size}) to editor</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>
}
