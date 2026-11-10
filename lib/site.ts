// One deployment, two addresses: Coldbrew (app.xxx.com) and its sending dashboard (config.xxx.com). proxy.ts reads
// the address each request was made to and tells the pages which site they're on through these request headers.

/** "config" on the sending dashboard, "app" on Coldbrew. */
export const SITE_HEADER = "x-coldbrew-site"
/** Where the dashboard's pages are: "" on its own address, "/config" on Coldbrew's. */
export const BASE_HEADER = "x-coldbrew-config-base"

/** The dashboard's addresses: CONFIG_HOSTS (comma-separated hosts, like "config.xxx.com"), or any host that starts
 * with "config." when it isn't set (config.localhost:3000 works locally). */
export function isConfigHost(host: string | null): boolean {
  if (!host) return false
  const listed = (process.env.CONFIG_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  const h = host.toLowerCase()
  return listed.length ? listed.includes(h) : h.startsWith("config.")
}
