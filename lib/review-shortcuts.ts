export function reviewShortcut(key: string, control: boolean, editing: boolean): "approve" | "next" | "previous" | null {
  if (control && key === "Enter") return "approve"
  if (editing || control) return null
  return key.toLowerCase() === "j" ? "next" : key.toLowerCase() === "k" ? "previous" : null
}

export function reviewOrderAfterChange(order: string[], currentId: string | null, nextId: string): string[] {
  return order.includes(nextId) ? order : order.map((id) => id === currentId ? nextId : id)
}
