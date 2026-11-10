import { notFound } from "next/navigation"

// Any other address on the sending dashboard: its own "not found" (app/config/not-found.tsx), inside its own shell,
// rather than Coldbrew's, which needs Coldbrew's sidebar.
export default function Missing() {
  notFound()
}
