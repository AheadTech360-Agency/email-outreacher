export interface SavedView { id: string; name: string; filters: Record<string, string> }
export function parseViews(raw: string): SavedView[] {
  try {
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.filter((v) => v && typeof v.id === "string" && typeof v.name === "string" && v.name.length <= 60 &&
      v.filters && typeof v.filters === "object" && !Array.isArray(v.filters) && Object.values(v.filters).every((x) => typeof x === "string")).slice(0, 20)
  } catch { return [] }
}
export function viewStorageKey(user: string, workspace: string, page: string): string {
  return `coldbrew:views:v1:${encodeURIComponent(user)}:${encodeURIComponent(workspace)}:${encodeURIComponent(page)}`
}
export function addSelection(current: Set<string>, ids: string[]): Set<string> { return new Set([...current, ...ids]) }
