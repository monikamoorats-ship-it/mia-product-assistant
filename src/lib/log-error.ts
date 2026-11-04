const SAFE_TOKEN = /^[A-Za-z0-9_-]{1,40}$/;

function safeToken(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_TOKEN.test(value) ? value : undefined;
}

/**
 * Builds a log line for a failed database call from the error class and error
 * codes only (for example PrismaClientKnownRequestError / P2021). The message
 * is never included: it can carry query parameters or request content.
 */
export function describeDbError(scope: string, error: unknown): string {
  const parts = [`scope=${safeToken(scope) ?? "unknown"}`];
  if (error instanceof Error) {
    parts.push(`name=${safeToken(error.name) ?? "Error"}`);
    const code = safeToken((error as { code?: unknown }).code);
    if (code) parts.push(`code=${code}`);
    const causeCode = safeToken((error.cause as { code?: unknown } | undefined)?.code);
    if (causeCode) parts.push(`cause=${causeCode}`);
  } else {
    parts.push("name=NonError");
  }
  return `[db-error] ${parts.join(" ")}`;
}

export function logDbError(scope: string, error: unknown): void {
  console.error(describeDbError(scope, error));
}
