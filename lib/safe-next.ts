/** Where to go after signing in: the ?next= page, only if it's on this address, else `fallback`. The value is resolved
 * against this address and its origin compared, so "//evil.com", "/\evil.com" and "https://evil.com" all fall back.
 * The full address is returned, not just its path: a same-site path like "//evil.com" (from "https://this-site//evil.com")
 * would be read as another site on its own. */
export function safeNext(raw: string | null | undefined, fallback: string): string {
  if (!raw || typeof window === "undefined") return fallback
  try {
    const url = new URL(raw, window.location.origin)
    return url.origin === window.location.origin ? url.href : fallback
  } catch {
    return fallback
  }
}
