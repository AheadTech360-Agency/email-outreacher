import type { PillTone } from "@/components/status"
import type { QuickstartRun } from "@/lib/api"

/** How a Quick Start run's status reads, on the list and on the run's page. */
export const RUN_STATUS: Record<QuickstartRun["status"], { label: string; tone: PillTone }> = {
  queued: { label: "Starting", tone: "info" },
  running: { label: "Running", tone: "info" },
  done: { label: "Done", tone: "positive" },
  stopped: { label: "Spend limit reached", tone: "warning" },
  failed: { label: "Failed", tone: "negative" },
  cancelled: { label: "Stopped", tone: "neutral" },
}
