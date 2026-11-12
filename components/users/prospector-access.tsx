"use client"

import { useState } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { type AccessGrant, type AccessKind, fetchIcps, fetchProducts, fetchSmartLists, useApi } from "@/lib/api"
import type { Workspace } from "@/lib/types"

const KINDS: { kind: AccessKind; title: string; none: string }[] = [
  { kind: "icp", title: "ICPs", none: "No ICPs yet." },
  { kind: "product", title: "Products", none: "No products in this workspace." },
  { kind: "smart_list", title: "Smart lists", none: "No smart lists in this workspace." },
]

export const accessKey = (kind: AccessKind, id: string) => `${kind}:${id}`

/** What a Prospector may see: each ICP, product and smart list in the workspaces ticked for them, to use or to edit.
 * What they created is theirs and can't be taken away here. */
export function ProspectorAccess({
  workspaces,
  grants,
  onChange,
}: {
  workspaces: Workspace[]
  grants: Map<string, AccessGrant>
  onChange: (next: Map<string, AccessGrant>) => void
}) {
  const [picked, setPicked] = useState(workspaces[0]?.id ?? "")
  const wsId = workspaces.some((w) => w.id === picked) ? picked : (workspaces[0]?.id ?? "")
  const items = useApi(
    () =>
      wsId
        ? Promise.all([fetchIcps(wsId), fetchProducts(wsId), fetchSmartLists(wsId, "company"), fetchSmartLists(wsId, "person")]).then(
            ([icps, products, companyLists, personLists]) => ({
              icp: icps.map((i) => ({ id: i.id, name: i.name, detail: i.enabled ? i.industry : `${i.industry} · archived` })),
              product: products.map((p) => ({ id: p.id, name: p.name, detail: p.archived ? "archived" : "" })),
              smart_list: [
                ...companyLists.lists.map((l) => ({ id: l.id, name: l.name, detail: `${l.count} companies` })),
                ...personLists.lists.map((l) => ({ id: l.id, name: l.name, detail: `${l.count} people` })),
              ],
            }),
          )
        : Promise.resolve(null),
    [wsId],
  )

  const set = (kind: AccessKind, id: string, see: boolean, edit: boolean) => {
    const next = new Map(grants)
    const key = accessKey(kind, id)
    if (!see) next.delete(key)
    else next.set(key, { kind, resourceId: id, workspaceId: wsId, canEdit: edit, isOwner: false })
    onChange(next)
  }

  if (!workspaces.length) return <p className="text-[13px] text-muted-foreground">Tick a workspace first.</p>
  return (
    <div className="space-y-3">
      {workspaces.length > 1 && (
        <Select value={wsId} onValueChange={setPicked}>
          <SelectTrigger className="w-full sm:w-64" aria-label="Workspace">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {items.error && !items.data ? (
        <p className="text-sm text-destructive">Couldn&apos;t load them: {items.error}</p>
      ) : !items.data ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        KINDS.map(({ kind, title, none }) => (
          <div key={kind} className="space-y-1">
            <p className="text-sm font-medium">{title}</p>
            {items.data![kind].length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{none}</p>
            ) : (
              <div className="divide-y divide-rule rounded-md border">
                {items.data![kind].map((item) => {
                  const g = grants.get(accessKey(kind, item.id))
                  const id = `access-${kind}-${item.id}`
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-3 py-2">
                      <Checkbox
                        id={id}
                        checked={!!g}
                        disabled={g?.isOwner}
                        onCheckedChange={(v) => set(kind, item.id, v === true, false)}
                      />
                      <Label htmlFor={id} className="min-w-0 flex-1 font-normal">
                        <span className="block truncate text-sm">{item.name}</span>
                        {item.detail && <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>}
                      </Label>
                      {g?.isOwner ? (
                        <span className="text-xs text-muted-foreground">They made it</span>
                      ) : (
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Checkbox
                            checked={!!g?.canEdit}
                            disabled={!g}
                            onCheckedChange={(v) => set(kind, item.id, true, v === true)}
                            aria-label={`Can edit ${item.name}`}
                          />
                          Can edit
                        </label>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}
