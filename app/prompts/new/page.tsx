import { NewPromptForm } from "@/components/prompt/new-prompt-form"
import type { PromptKind } from "@/lib/types"

const KINDS: PromptKind[] = ["verify", "hook", "email", "score", "followup2", "followup3", "followup4", "followup5", "sort", "sort_people"]

export default async function NewPromptPage({ searchParams }: { searchParams: Promise<{ kind?: string | string[] }> }) {
  const { kind } = await searchParams
  const initialKind = KINDS.find((k) => k === kind) ?? "email"
  return <NewPromptForm initialKind={initialKind} />
}
