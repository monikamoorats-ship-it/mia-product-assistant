import { describe, expect, it } from "vitest";
import { ConfigError, requireDatabaseUrl } from "@/lib/env";
import { checkHealth } from "@/lib/health";
import { UnsafeTestDatabaseError, assertSafeTestDatabase } from "@/lib/test-db-guard";

describe("checkHealth", () => {
  it("returns 200 ok when the probe succeeds", async () => {
    await expect(checkHealth(async () => 1)).resolves.toEqual({ status: 200, body: { status: "ok" } });
  });

  it("returns 503 unavailable when the probe fails, without leaking details", async () => {
    const result = await checkHealth(async () => {
      throw new Error("password authentication failed for user admin at db.internal:5432");
    });
    expect(result).toEqual({ status: 503, body: { status: "unavailable" } });
    expect(JSON.stringify(result)).not.toMatch(/password|admin|internal|5432/);
  });

  it("returns 503 when the probe hangs past the timeout", async () => {
    const result = await checkHealth(() => new Promise(() => {}), 20);
    expect(result.status).toBe(503);
  });
});

describe("requireDatabaseUrl", () => {
  it("returns the trimmed URL when set", () => {
    expect(requireDatabaseUrl({ DATABASE_URL: " postgresql://x/y " })).toBe("postgresql://x/y");
  });

  it("fails clearly when missing or blank", () => {
    expect(() => requireDatabaseUrl({})).toThrow(ConfigError);
    expect(() => requireDatabaseUrl({ DATABASE_URL: "  " })).toThrow(/DATABASE_URL/);
  });
});

describe("assertSafeTestDatabase", () => {
  const ok = {
    NODE_ENV: "test",
    ALLOW_TEST_DATABASE_RESET: "true",
    TEST_DATABASE_URL: "postgresql://u:secret@localhost:5432/mia_test",
  };

  it("accepts a fully safe configuration", () => {
    expect(assertSafeTestDatabase(ok)).toBe(ok.TEST_DATABASE_URL);
  });

  it("refuses when NODE_ENV is not test", () => {
    expect(() => assertSafeTestDatabase({ ...ok, NODE_ENV: "production" })).toThrow(UnsafeTestDatabaseError);
  });

  it("refuses without the explicit reset flag", () => {
    expect(() => assertSafeTestDatabase({ ...ok, ALLOW_TEST_DATABASE_RESET: undefined })).toThrow(/ALLOW_TEST_DATABASE_RESET/);
  });

  it("refuses without TEST_DATABASE_URL", () => {
    expect(() => assertSafeTestDatabase({ ...ok, TEST_DATABASE_URL: undefined })).toThrow(/TEST_DATABASE_URL/);
  });

  it("refuses when it equals DATABASE_URL", () => {
    expect(() => assertSafeTestDatabase({ ...ok, DATABASE_URL: ok.TEST_DATABASE_URL })).toThrow(/differ/);
  });

  it("refuses a database name without 'test'", () => {
    expect(() =>
      assertSafeTestDatabase({ ...ok, TEST_DATABASE_URL: "postgresql://u:secret@host:5432/railway" }),
    ).toThrow(/name must contain/);
  });

  it("never puts the connection string or password in an error message", () => {
    try {
      assertSafeTestDatabase({ ...ok, TEST_DATABASE_URL: "postgresql://u:secret@host:5432/railway" });
    } catch (error) {
      expect((error as Error).message).not.toMatch(/secret|host:5432/);
    }
  });
});
