/** Addresses that need their own OK before they're queued, and why. The backend skips them otherwise
 * (services/outreach.py CONFIRM_FIRST). */
const CONFIRM_NOTES: Record<string, string> = {
  // A catch-all domain accepts any address, so the email check can't confirm it.
  risky:
    "Their company's mail server accepts any address, so the email check couldn't confirm it. It may bounce, and bounces hurt your sending reputation.",
  // orders@ or info@ from the company's site: a shared inbox, not a person.
  website: "This is the general address from their website (like orders@ or info@), not a person's. Whoever answers that inbox reads it.",
}

export const needsConfirm = (status: string | null | undefined) => !!status && status in CONFIRM_NOTES

export const confirmNote = (status: string | null | undefined) => (status && CONFIRM_NOTES[status]) || ""

/** "risky address" or "website address", for lists of drafts that need confirming. */
export const confirmKind = (status: string | null | undefined) => (status === "website" ? "website address" : "risky address")
