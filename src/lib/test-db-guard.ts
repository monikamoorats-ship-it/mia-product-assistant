/**
 * Safety guard for destructive database test setup. Integration tests may
 * wipe tables, so they must only ever run against a throwaway database that
 * CI created. The guard never includes connection strings in its errors.
 */
export class UnsafeTestDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeTestDatabaseError";
  }
}

type Env = Record<string, string | undefined>;

/** Returns TEST_DATABASE_URL only when every safety condition holds. */
export function assertSafeTestDatabase(env: Env = process.env): string {
  if (env.NODE_ENV !== "test") {
    throw new UnsafeTestDatabaseError("Refusing to reset a database: NODE_ENV must be 'test'.");
  }
  if (env.ALLOW_TEST_DATABASE_RESET !== "true") {
    throw new UnsafeTestDatabaseError(
      "Refusing to reset a database: ALLOW_TEST_DATABASE_RESET must be 'true'.",
    );
  }
  const url = env.TEST_DATABASE_URL?.trim();
  if (!url) {
    throw new UnsafeTestDatabaseError("Refusing to reset a database: TEST_DATABASE_URL is not set.");
  }
  if (env.DATABASE_URL && env.DATABASE_URL.trim() === url) {
    throw new UnsafeTestDatabaseError(
      "Refusing to reset a database: TEST_DATABASE_URL must differ from DATABASE_URL.",
    );
  }
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    throw new UnsafeTestDatabaseError("Refusing to reset a database: TEST_DATABASE_URL is not a valid URL.");
  }
  if (!/test/i.test(databaseName)) {
    throw new UnsafeTestDatabaseError(
      "Refusing to reset a database: the database name must contain 'test'.",
    );
  }
  return url;
}
