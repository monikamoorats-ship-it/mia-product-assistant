/**
 * Anonymous owner identity. The browser holds an opaque 256-bit token in an
 * HTTP-only cookie; records store only a SHA-256 hash of it as `ownerId`, so a
 * database leak does not reveal valid cookies. The token is never logged.
 */
import { createHash, randomBytes } from "node:crypto";

export const OWNER_COOKIE = "mia_owner";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url, no padding

/** 256 bits from a cryptographically secure source, base64url encoded. */
export function generateOwnerToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isValidOwnerToken(token: string | undefined | null): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

/** Fixed hash stored as `ownerId` (64 hex characters). */
export function hashOwnerToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function ownerCookieOptions(isProduction: boolean = process.env.NODE_ENV === "production") {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  };
}

/** Returns the owner hash for a raw cookie value, or null when absent/invalid. */
export function ownerIdFromCookie(value: string | undefined | null): string | null {
  return isValidOwnerToken(value) ? hashOwnerToken(value) : null;
}
