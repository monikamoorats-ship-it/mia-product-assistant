import { jsonError, rateLimited, safeErrorResponse, guardMutation } from "@/lib/api";
import { generateOwnerToken, hashOwnerToken, serializeOwnerCookie } from "@/lib/owner";
import { newOwnerLimiter } from "@/lib/rate-limit";
import { AppError } from "./errors";

export type WriteContext = {
  ownerId: string;
  ip: string;
  /** Set-Cookie value when a new owner cookie must be issued with the response. */
  setCookie: string | null;
};

/**
 * Standard checks for a state-changing API request: allowed method, same
 * origin and an owner. A request without an owner cookie may be issued one,
 * but only within the per-IP new-owner rate limit (checked before any write).
 */
export function prepareWrite(
  request: Request,
  allowedMethods: readonly string[],
): { ok: true; ctx: WriteContext } | { ok: false; response: Response } {
  const guard = guardMutation(request, allowedMethods);
  if (!guard.ok) return guard;
  if (guard.ownerId) return { ok: true, ctx: { ownerId: guard.ownerId, ip: guard.ip, setCookie: null } };

  const decision = newOwnerLimiter.hit(guard.ip);
  if (!decision.allowed) return { ok: false, response: rateLimited(decision.retryAfterSeconds) };
  const token = generateOwnerToken();
  return { ok: true, ctx: { ownerId: hashOwnerToken(token), ip: guard.ip, setCookie: serializeOwnerCookie(token) } };
}

export function withCookie(response: Response, ctx: Pick<WriteContext, "setCookie">): Response {
  if (ctx.setCookie) response.headers.append("Set-Cookie", ctx.setCookie);
  return response;
}

/** Maps expected AppErrors to their status/message; anything else to a safe 503. */
export function errorToResponse(error: unknown): Response {
  if (error instanceof AppError) return jsonError(error.status, error.message, { fields: error.fields });
  return safeErrorResponse(error);
}
