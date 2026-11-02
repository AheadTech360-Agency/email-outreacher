import type { Settings } from "./types"

// What a workspace's settings show until the backend's answer arrives (its own defaults are the same).

export const DEFAULT_SETTINGS: Settings = {
  defaultModel: "claude-haiku-5-5",
  postsPerLead: 5,
  maxPostAgeDays: 60,
  monthlyBudgetUsd: 150,
  scoring: { promptId: null, threshold: 80, autoSend: false, dailyAutoSendCap: 50 },
  companyApproval: { threshold: 60, autoApprove: true },
}
