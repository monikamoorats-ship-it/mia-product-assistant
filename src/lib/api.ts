/**
 * API foundations shared by route handlers. Framework-free (uses the standard
 * Request/Response) so the behaviour can be unit-tested without Next.js.
 * Nothing here logs request bodies, owner cookies or message text.
 */
import { OWNER_COOKIE, ownerIdFromCookie } from "./owner";
import { MUTATING_METHODS, getClientIp, isSameOrigin } from "./request-meta";
import type { FieldErrors } from "./validation";

export const MAX_BODY_BYTES = 10 * 1024; // 10 KB

export const MESSAGES = {
  dbUnavailable: "Mia can’t reach the database right now. Please try again in a moment.",
  tooManyRequests: "Too many requests. Please wait a moment and try again.",
  bodyTooLarge: "That request is too large. Please shorten it and try again.",
  badRequest: "That request could not be understood. Please try again.",
  forbidden: "This request was blocked for security reasons. Please reload the page and try again.",
  notFound: "We couldn’t find what you were looking for.",
  unexpected: "Something went wrong. Please try again.",
} as const;

export function jsonError(status: number, message: string, extra: { fields?: FieldErrors; retryAfterSeconds?: number } = {}) {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (extra.retryAfterSeconds !== undefined) headers["Retry-After"] = String(extra.retryAfterSeconds);
  return Response.json({ error: message, ...(extra.fields ? { fields: extra.fields } : {}) }, { status, headers });
}

export const validationError = (fields: FieldErrors) =>
  jsonError(422, Object.values(fields)[0] ?? MESSAGES.badRequest, { fields });
export const rateLimited = (retryAfterSeconds: number) =>
  jsonError(429, MESSAGES.tooManyRequests, { retryAfterSeconds });
export const dbUnavailable = () => jsonError(503, MESSAGES.dbUnavailable);
export const notFound = () => jsonError(404, MESSAGES.notFound);

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Reads the current owner hash from the cookie header; null when absent/invalid. */
export function getOwnerId(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === OWNER_COOKIE) return ownerIdFromCookie(rest.join("="));
  }
  return null;
}

export type BodyResult = { ok: true; value: unknown } | { ok: false; response: Response };

/**
 * Reads a JSON body, rejecting anything over 10 KB with 413 before the full
 * payload is buffered (Content-Length is checked first, then the stream is
 * read with a running byte count).
 */
export async function readJsonBody(request: Request, maxBytes = MAX_BODY_BYTES): Promise<BodyResult> {
  const tooLarge = { ok: false as const, response: jsonError(413, MESSAGES.bodyTooLarge) };
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge;

  if (!request.body) return { ok: false, response: jsonError(400, MESSAGES.badRequest) };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return tooLarge;
    }
    chunks.push(value);
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: jsonError(400, MESSAGES.badRequest) };
  }
}

/**
 * Checks that must pass before any state-changing request is processed:
 * allowed method, same-origin, and (for writes) an owner cookie.
 * Returns an error Response, or the owner hash and client IP.
 */
export function guardMutation(
  request: Request,
  allowedMethods: readonly string[],
): { ok: true; ownerId: string | null; ip: string } | { ok: false; response: Response } {
  if (!allowedMethods.includes(request.method)) {
    return { ok: false, response: jsonError(405, MESSAGES.badRequest) };
  }
  if (MUTATING_METHODS.has(request.method) && !isSameOrigin(request.headers)) {
    return { ok: false, response: jsonError(403, MESSAGES.forbidden) };
  }
  return { ok: true, ownerId: getOwnerId(request), ip: getClientIp(request.headers) };
}

/**
 * Maps any thrown database/config error to a safe 503 (or 500). Never exposes
 * Prisma codes, connection details or stack traces.
 */
export function safeErrorResponse(_error: unknown): Response {
  void _error; // intentionally not logged: errors may carry request content
  return dbUnavailable();
}
