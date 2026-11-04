/**
 * Request metadata helpers. Framework-free (plain Headers) so they are
 * unit-testable without Next.js.
 */

/**
 * Client IP as reported by Railway's edge in `X-Real-IP`. `X-Forwarded-For`
 * is deliberately NOT used: a client can prepend arbitrary values to it.
 * Outside Railway (no header) all clients share the "unknown" bucket, which is
 * the conservative choice for rate limiting.
 */
export function getClientIp(headers: Headers): string {
  const ip = headers.get("x-real-ip")?.trim();
  return ip && ip.length <= 64 ? ip : "unknown";
}

/** True for router prefetches and browser speculative loads. */
export function isPrefetchRequest(headers: Headers): boolean {
  if (headers.has("next-router-prefetch") || headers.has("x-middleware-prefetch")) return true;
  const purpose = `${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""}`.toLowerCase();
  return purpose.includes("prefetch") || purpose.includes("prerender");
}

type CookieDecisionInput = {
  method: string;
  headers: Headers;
  hasValidOwnerCookie: boolean;
};

/**
 * A new owner cookie is issued only on a genuine page navigation: a GET that
 * asks for HTML, is not a prefetch, and arrives without a valid cookie.
 */
export function shouldIssueOwnerCookie({ method, headers, hasValidOwnerCookie }: CookieDecisionInput): boolean {
  if (hasValidOwnerCookie) return false;
  if (method !== "GET") return false;
  if (isPrefetchRequest(headers)) return false;
  if (headers.has("rsc")) return false; // client-side RSC fetches are not first navigations
  return (headers.get("accept") ?? "").includes("text/html");
}

/**
 * Same-origin check for state-changing requests. Uses Origin when present,
 * otherwise Referer. Requests with neither header are rejected: browsers
 * always send Origin on cross-origin POST/PUT/PATCH/DELETE.
 */
export function isSameOrigin(headers: Headers): boolean {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return false;
  const source = headers.get("origin") ?? headers.get("referer");
  if (!source) return false;
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

export const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
