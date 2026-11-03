"use client"

import Link from "next/link"
import { useState } from "react"
import { Package, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { BackendError, WorkspaceGate } from "@/components/companies/backend-state"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { EmptyState } from "@/components/empty-state"
import { ManagerOnly } from "@/components/manager-only"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/table-skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  type Product,
  type ProductFields,
  createProduct,
  deleteProduct,
  fetchIcps,
  fetchProducts,
  updateProduct,
  useApi,
} from "@/lib/api"
import { shortDate } from "@/lib/format"

const FIELDS: { key: Exclude<keyof ProductFields, "name" | "url">; label: string; hint: string; placeholder: string; rows: number }[] = [
  {
    key: "description",
    label: "What it is",
    hint: "{{product.description}}. One or two plain sentences.",
    placeholder: "Meta ads management for apparel brands, with creative testing every week",
    rows: 2,
  },
  {
    key: "value",
    label: "What it does for them",
    hint: "{{product.value}}. The outcome they get, in their words.",
    placeholder: "More profitable first orders without discounting deeper",
    rows: 2,
  },
  {
    key: "proof",
    label: "Proof",
    hint: "{{product.proof}}. Only verified results, written exactly as you can claim them. Claude is told never to invent results.",
    placeholder: "Case studies or results you can show on request",
    rows: 3,
  },
  {
    key: "offer",
    label: "Pricing or offer",
    hint: "{{product.offer}}. Leave empty if emails shouldn't mention it.",
    placeholder: "Free account teardown before any commitment",
    rows: 2,
  },
  {
    key: "cta",
    label: "Call to action",
    hint: "{{product.cta}}. The one next step emails ask for.",
    placeholder: "A 15-minute call to walk through the teardown",
    rows: 2,
  },
]

const EMPTY: ProductFields = { name: "", description: "", value: "", proof: "", offer: "", cta: "", url: "" }

export function ProductsView() {
  return (
    <>
      <PageHeader
        title="Products"
        description="What you sell. Each ICP picks one on its page, and its prompts can use the product's details as {{product.*}}."
      />
      <div className="space-y-4 px-4 pb-10 md:px-8">
        <WorkspaceGate>{(wsId) => <Products key={wsId} wsId={wsId} />}</WorkspaceGate>
      </div>
    </>
  )
}

function Products({ wsId }: { wsId: string }) {
  const products = useApi(() => fetchProducts(wsId), [wsId])
  const icps = useApi(() => fetchIcps(wsId), [wsId])
  const [editing, setEditing] = useState<Product | "new" | null>(null)
  const [deleting, setDeleting] = useState<Product | null>(null)

  if (products.error && !products.data) return <BackendError message={products.error} onRetry={products.reload} />
  if (!products.data) return <TableSkeleton rows={4} />

  const icpName = new Map((icps.data ?? []).map((i) => [i.id, i.name]))
  const list = products.data

  return (
    <>
      {list.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Add what you sell, then pick a product on each ICP. Its details become available to that ICP's prompts."
          action={
            <ManagerOnly><Button onClick={() => setEditing("new")}>
              <Plus /> Add a product
            </Button></ManagerOnly>
          }
        />
      ) : (
        <>
          <div className="flex justify-end">
            <ManagerOnly><Button onClick={() => setEditing("new")}>
              <Plus /> Add a product
            </Button></ManagerOnly>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Sold to</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Delete</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => setEditing(p)}>
                    <TableCell className="max-w-md">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="truncate text-[13px] text-muted-foreground">{p.description || "No description yet"}</p>
                    </TableCell>
                    <TableCell className="max-w-64 text-[13px]" onClick={(e) => e.stopPropagation()}>
                      {p.icpIds.length ? (
                        <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                          {p.icpIds.map((id) => (
                            <Link key={id} href={`/icps/${id}`} className="hover:underline">
                              {icpName.get(id) ?? "ICP"}
                            </Link>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No ICP yet</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{shortDate(p.updatedAt)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <ManagerOnly>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Delete ${p.name}`}
                          title="Delete"
                          onClick={() => setDeleting(p)}
                        >
                          <Trash2 />
                        </Button>
                      </ManagerOnly>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "this product"}?`}
        description={
          deleting?.icpIds.length
            ? `It's sold to ${deleting.icpIds.map((id) => icpName.get(id) ?? "an ICP").join(", ")}: they'll have no product until you pick another, and their emails can't be written until then (unless the ICP has its own offer).`
            : "It isn't used by any ICP."
        }
        confirmLabel="Delete product"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteProduct(wsId, deleting.id)
            toast.success(`Deleted ${deleting.name}`)
            products.reload()
          } catch (e) {
            toast.error("Couldn't delete it", { description: e instanceof Error ? e.message : undefined })
          } finally {
            setDeleting(null)
          }
        }}
      />

      {editing && (
        <ProductSheet
          key={editing === "new" ? "new" : editing.id}
          wsId={wsId}
          product={editing === "new" ? null : editing}
          icpNames={editing === "new" ? [] : editing.icpIds.map((id) => icpName.get(id) ?? "an ICP")}
          onClose={() => setEditing(null)}
          onSaved={products.reload}
        />
      )}
    </>
  )
}

function ProductSheet({
  wsId,
  product,
  icpNames,
  onClose,
  onSaved,
}: {
  wsId: string
  product: Product | null
  icpNames: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<ProductFields>(() =>
    product
      ? { name: product.name, description: product.description, value: product.value, proof: product.proof, offer: product.offer, cta: product.cta, url: product.url }
      : EMPTY,
  )
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const nameError = touched && !draft.name.trim() ? "Give the product a name" : ""

  const save = async () => {
    setTouched(true)
    if (!draft.name.trim()) return
    setBusy(true)
    try {
      if (product) await updateProduct(wsId, product.id, draft)
      else await createProduct(wsId, draft)
      toast.success(product ? `Saved ${draft.name.trim()}` : `Added ${draft.name.trim()}`)
      onSaved()
      onClose()
    } catch (e) {
      toast.error("Couldn't save it", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!product) return
    try {
      await deleteProduct(wsId, product.id)
      toast.success(`Deleted ${product.name}`)
      onSaved()
      onClose()
    } catch (e) {
      toast.error("Couldn't delete it", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setConfirmDelete(false)
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && !busy && onClose()}>
      <SheetContent className="w-full! gap-0 overflow-y-auto sm:max-w-lg!">
        <SheetHeader className="px-5 pt-5 pb-4">
          <SheetTitle className="text-lg">{product ? product.name : "New product"}</SheetTitle>
          <SheetDescription>
            {icpNames.length
              ? `Sold to ${icpNames.join(", ")}. Changes apply to their next emails.`
              : "Pick it on an ICP's page to use it in that ICP's prompts."}
          </SheetDescription>
        </SheetHeader>
        <form
          id="product-form"
          className="space-y-4 border-t border-rule px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="product-name">Name</Label>
            <Input
              id="product-name"
              value={draft.name}
              aria-invalid={!!nameError || undefined}
              aria-describedby="product-name-hint"
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
            <p id="product-name-hint" className={nameError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {nameError || "{{product.name}}"}
            </p>
          </div>
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`product-${f.key}`}>{f.label}</Label>
              <Textarea
                id={`product-${f.key}`}
                rows={f.rows}
                placeholder={f.placeholder}
                value={draft[f.key]}
                aria-describedby={`product-${f.key}-hint`}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              />
              <p id={`product-${f.key}-hint`} className="text-xs text-muted-foreground">
                {f.hint}
              </p>
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="product-url">Link</Label>
            <Input
              id="product-url"
              placeholder="https://"
              value={draft.url}
              onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">{"{{product.url}}"}. A page about it, if emails should link to one.</p>
          </div>
        </form>
        <SheetFooter className="flex-row flex-wrap justify-between gap-2 border-t border-rule px-5 py-4">
          {product ? (
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={busy || icpNames.length > 0}
              title={icpNames.length ? "An ICP sells it. Pick another product on that ICP first." : undefined}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="product-form" disabled={busy}>
              {busy ? "Saving…" : product ? "Save" : "Add product"}
            </Button>
          </div>
        </SheetFooter>
        {product && (
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            destructive
            title={`Delete ${product.name}?`}
            description="It's removed from this workspace. This can't be undone."
            confirmLabel="Delete product"
            onConfirm={() => void remove()}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
