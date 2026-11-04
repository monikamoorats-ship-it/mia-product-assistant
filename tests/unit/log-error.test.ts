import { describe, expect, it } from "vitest";
import { describeDbError } from "@/lib/log-error";

describe("describeDbError", () => {
  it("logs only the error class and codes, never the message", () => {
    const error = Object.assign(new Error("password=hunter2 chat text"), { code: "P2021", name: "PrismaClientKnownRequestError" });
    const line = describeDbError("page-chat", error);
    expect(line).toBe("[db-error] scope=page-chat name=PrismaClientKnownRequestError code=P2021");
    expect(line).not.toContain("hunter2");
  });

  it("includes a cause code and rejects unsafe tokens", () => {
    const error = new Error("x", { cause: { code: "42P01" } });
    expect(describeDbError("api", error)).toBe("[db-error] scope=api name=Error cause=42P01");
    expect(describeDbError("a b\nc", "boom")).toBe("[db-error] scope=unknown name=NonError");
  });
});
