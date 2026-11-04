export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Returns DATABASE_URL or fails clearly. Called lazily (on first database
 * use), never at import time, so `next build` works without a database.
 */
export function requireDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    throw new ConfigError(
      "DATABASE_URL is not set. On Railway it is supplied by the PostgreSQL service as a reference variable.",
    );
  }
  return url;
}
