import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  OWNER_COOKIE,
  generateOwnerToken,
  isValidOwnerToken,
  ownerCookieOptions,
} from "@/lib/owner";
import { getClientIp, shouldIssueOwnerCookie } from "@/lib/request-meta";
import { newOwnerLimiter } from "@/lib/rate-limit";

/**
 * Issues the anonymous owner cookie on the first genuine page navigation.
 * Nothing is stored in the database for a new cookie, prefetches never get
 * one, and the cookie value is never logged.
 */
export function proxy(request: NextRequest) {
  const hasValidOwnerCookie = isValidOwnerToken(request.cookies.get(OWNER_COOKIE)?.value);
  if (!shouldIssueOwnerCookie({ method: request.method, headers: request.headers, hasValidOwnerCookie })) {
    return NextResponse.next();
  }

  // Best-effort cap on cookies issued per IP. When exceeded the page still
  // loads; the visitor just stays "ownerless" and cannot write.
  const decision = newOwnerLimiter.hit(getClientIp(request.headers));
  if (!decision.allowed) return NextResponse.next();

  const token = generateOwnerToken();
  // Make the new cookie visible to this same request's server components.
  const requestHeaders = new Headers(request.headers);
  const existing = requestHeaders.get("cookie");
  requestHeaders.set("cookie", `${existing ? `${existing}; ` : ""}${OWNER_COOKIE}=${token}`);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set(OWNER_COOKIE, token, ownerCookieOptions());
  return response;
}

export const config = {
  matcher: [
    // Skip health check, Next.js internals/static/image assets and public metadata files.
    "/((?!api/health|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|xml|woff2?)$).*)",
  ],
};
