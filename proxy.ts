import { type NextRequest, NextResponse } from "next/server"
import { refusal } from "@/lib/authorized-urls"
import { BASE_HEADER, SITE_HEADER, isConfigHost } from "@/lib/site"

// Every request, pages and files included, must be made to an address in AUTHORIZED_URLS. Calls to the
// API are also checked for coming from a page on one of those addresses (app/api/v1 checks again).
//
// One deployment serves two sites by address: Coldbrew, and its sending dashboard on config.xxx.com (CONFIG_HOSTS).
// On the dashboard's address every page is served from app/config ("/senders" is app/config/senders) and Coldbrew's
// own pages don't exist there. On Coldbrew's address the dashboard is still reachable at /config.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const reason = refusal(request, { api: pathname.startsWith("/api/") })
  if (reason) return new NextResponse("Not authorized.", { status: 403, headers: { "Cache-Control": "no-store" } })

  // The backend proxy and Next's own files are the same on both sites.
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/") || /\.[a-z0-9]+$/i.test(pathname)) return NextResponse.next()

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  const headers = new Headers(request.headers)
  if (isConfigHost(host)) {
    // A /config address here (from a bookmark made on Coldbrew's address): the same page without the prefix.
    if (pathname === "/config" || pathname.startsWith("/config/")) {
      const url = request.nextUrl.clone()
      url.pathname = pathname.slice("/config".length) || "/"
      return NextResponse.redirect(url)
    }
    headers.set(SITE_HEADER, "config")
    headers.set(BASE_HEADER, "")
    const url = request.nextUrl.clone()
    url.pathname = `/config${pathname === "/" ? "" : pathname}`
    return NextResponse.rewrite(url, { request: { headers } })
  }

  if (pathname === "/") return NextResponse.redirect(new URL("/home", request.url))
  const onConfig = pathname === "/config" || pathname.startsWith("/config/")
  headers.set(SITE_HEADER, onConfig ? "config" : "app")
  headers.set(BASE_HEADER, "/config")
  return NextResponse.next({ request: { headers } })
}
