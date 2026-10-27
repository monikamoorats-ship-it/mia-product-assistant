import { describe, expect, it } from "vitest";
import {
  MESSAGES,
  getOwnerId,
  guardMutation,
  readJsonBody,
  safeErrorResponse,
} from "@/lib/api";
import {
  OWNER_COOKIE,
  generateOwnerToken,
  hashOwnerToken,
  isValidOwnerToken,
  ownerCookieOptions,
  ownerIdFromCookie,
} from "@/lib/owner";
import {
  ConcurrencyLimiter,
  GenerationLimiter,
  NewOwnerLimiter,
  SlidingWindowLimiter,
} from "@/lib/rate-limit";
import { getClientIp, isPrefetchRequest, isSameOrigin, shouldIssueOwnerCookie } from "@/lib/request-meta";
import {
  makeChatTitle,
  validateMessage,
  validatePersonaInput,
  validateProductInput,
  validateQuizResult,
  validateSettings,
} from "@/lib/validation";

describe("owner token and cookie", () => {
  it("generates 256 bits of random, opaque, url-safe data", () => {
    const token = generateOwnerToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(generateOwnerToken()).not.toBe(token);
  });

  it("stores only a fixed 64-hex hash, never the raw token", () => {
    const token = generateOwnerToken();
    const hash = hashOwnerToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashOwnerToken(token)).toBe(hash);
    expect(ownerIdFromCookie(token)).toBe(hash);
  });

  it("rejects malformed cookie values", () => {
    expect(isValidOwnerToken("short")).toBe(false);
    expect(isValidOwnerToken(undefined)).toBe(false);
    expect(ownerIdFromCookie("x".repeat(43) + "!")).toBeNull();
  });

  it("uses HttpOnly, SameSite=Lax, Path=/, one year, Secure only in production", () => {
    const prod = ownerCookieOptions(true);
    expect(prod).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: true, maxAge: 31536000 });
    expect(ownerCookieOptions(false).secure).toBe(false);
  });

  it("reads the owner from a Cookie header", () => {
    const token = generateOwnerToken();
    const request = new Request("https://mia.test/api/x", { headers: { cookie: `a=1; ${OWNER_COOKIE}=${token}; b=2` } });
    expect(getOwnerId(request)).toBe(hashOwnerToken(token));
    expect(getOwnerId(new Request("https://mia.test/"))).toBeNull();
  });
});

describe("cookie issuance decisions", () => {
  const nav = new Headers({ accept: "text/html,application/xhtml+xml" });
  const decide = (headers: Headers, extra: Partial<{ method: string; hasValidOwnerCookie: boolean }> = {}) =>
    shouldIssueOwnerCookie({ method: "GET", hasValidOwnerCookie: false, headers, ...extra });

  it("issues a cookie on the first normal navigation", () => {
    expect(decide(nav)).toBe(true);
  });

  it("never issues when a valid cookie exists", () => {
    expect(decide(nav, { hasValidOwnerCookie: true })).toBe(false);
  });

  it("never issues for prefetches", () => {
    expect(decide(new Headers({ accept: "text/html", "next-router-prefetch": "1" }))).toBe(false);
    expect(decide(new Headers({ accept: "text/html", purpose: "prefetch" }))).toBe(false);
    expect(decide(new Headers({ accept: "text/html", "sec-purpose": "prefetch;prerender" }))).toBe(false);
    expect(isPrefetchRequest(nav)).toBe(false);
  });

  it("never issues for non-GET, non-HTML or RSC requests", () => {
    expect(decide(nav, { method: "POST" })).toBe(false);
    expect(decide(new Headers({ accept: "application/json" }))).toBe(false);
    expect(decide(new Headers({ accept: "text/html", rsc: "1" }))).toBe(false);
  });
});

describe("client ip and same-origin", () => {
  it("uses X-Real-IP and ignores a client-supplied X-Forwarded-For", () => {
    const headers = new Headers({ "x-real-ip": "203.0.113.5", "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getClientIp(headers)).toBe("203.0.113.5");
    expect(getClientIp(new Headers({ "x-forwarded-for": "1.2.3.4" }))).toBe("unknown");
  });

  it("accepts same-origin and rejects cross-origin or header-less mutations", () => {
    expect(isSameOrigin(new Headers({ host: "mia.test", origin: "https://mia.test" }))).toBe(true);
    expect(isSameOrigin(new Headers({ host: "mia.test", referer: "https://mia.test/chat" }))).toBe(true);
    expect(isSameOrigin(new Headers({ host: "mia.test", origin: "https://evil.test" }))).toBe(false);
    expect(isSameOrigin(new Headers({ host: "mia.test" }))).toBe(false);
  });
});

describe("rate limiters", () => {
  it("allows 20 generation requests per minute per owner, then 429 info with Retry-After", () => {
    let now = 0;
    const limiter = new GenerationLimiter(() => now);
    for (let i = 0; i < 20; i++) {
      const gate = limiter.acquire("owner", `ip-${i}`);
      expect(gate.ok).toBe(true);
      if (gate.ok) gate.release();
    }
    const blocked = limiter.acquire("owner", "ip-x");
    expect(blocked.ok).toBe(false);
    expect(!blocked.ok && blocked.retryAfterSeconds).toBeGreaterThan(0);
    now = 61_000;
    const again = limiter.acquire("owner", "ip-x");
    expect(again.ok).toBe(true);
  });

  it("limits 20 generation requests per minute per IP across owners", () => {
    const limiter = new GenerationLimiter(() => 0);
    for (let i = 0; i < 20; i++) {
      const gate = limiter.acquire(`owner-${i}`, "same-ip");
      expect(gate.ok).toBe(true);
      if (gate.ok) gate.release();
    }
    expect(limiter.acquire("owner-new", "same-ip").ok).toBe(false);
  });

  it("limits concurrent generations to 2 per owner and 5 per IP, and release frees a slot", () => {
    const limiter = new GenerationLimiter(() => 0);
    const a = limiter.acquire("o1", "ip1");
    const b = limiter.acquire("o1", "ip1");
    expect(limiter.acquire("o1", "ip1").ok).toBe(false);
    if (a.ok) a.release();
    expect(limiter.acquire("o1", "ip1").ok).toBe(true);
    if (b.ok) b.release();

    const ipLimiter = new GenerationLimiter(() => 0);
    const held = [1, 2, 3, 4, 5].map((n) => ipLimiter.acquire(`o${n}`, "ipX"));
    expect(held.every((g) => g.ok)).toBe(true);
    expect(ipLimiter.acquire("o6", "ipX").ok).toBe(false);
  });

  it("a rejected request does not leak a concurrency slot", () => {
    const limiter = new GenerationLimiter(() => 0);
    for (let i = 0; i < 20; i++) {
      const g = limiter.acquire("owner", `ip${i}`);
      if (g.ok) g.release();
    }
    for (let i = 0; i < 10; i++) expect(limiter.acquire("owner", "ipZ").ok).toBe(false);
    // After the window passes the owner still has free concurrency slots.
    const later = new GenerationLimiter(() => 0);
    expect(later.acquire("owner", "ip").ok).toBe(true);
  });

  it("caps new anonymous owner cookies at 10 per hour per IP", () => {
    let now = 0;
    const limiter = new NewOwnerLimiter(() => now);
    for (let i = 0; i < 10; i++) expect(limiter.hit("1.1.1.1").allowed).toBe(true);
    const blocked = limiter.hit("1.1.1.1");
    expect(blocked.allowed).toBe(false);
    expect(limiter.hit("2.2.2.2").allowed).toBe(true);
    now = 3_600_001;
    expect(limiter.hit("1.1.1.1").allowed).toBe(true);
  });

  it("sliding window and concurrency primitives behave", () => {
    const w = new SlidingWindowLimiter(2, 1000, () => 0);
    expect([w.hit("k").allowed, w.hit("k").allowed, w.hit("k").allowed]).toEqual([true, true, false]);
    const c = new ConcurrencyLimiter(1);
    const release = c.acquire("k");
    expect(c.acquire("k")).toBeNull();
    release?.();
    release?.(); // double release is harmless
    expect(c.acquire("k")).not.toBeNull();
  });
});

describe("request bodies and API responses", () => {
  const post = (body: string, headers: Record<string, string> = {}) =>
    new Request("https://mia.test/api/x", { method: "POST", body, headers: { "content-type": "application/json", ...headers } });

  it("parses valid JSON", async () => {
    const result = await readJsonBody(post(JSON.stringify({ a: 1 })));
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it("rejects bodies over 10 KB with 413 and a friendly message", async () => {
    const result = await readJsonBody(post(JSON.stringify({ text: "x".repeat(11 * 1024) })));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(413);
      expect((await result.response.json()).error).toBe(MESSAGES.bodyTooLarge);
    }
  });

  it("rejects an oversized declared Content-Length before reading the body", async () => {
    const result = await readJsonBody(post("{}", { "content-length": String(50 * 1024) }));
    expect(!result.ok && result.response.status).toBe(413);
  });

  it("rejects malformed JSON with 400", async () => {
    const result = await readJsonBody(post("{not json"));
    expect(!result.ok && result.response.status).toBe(400);
  });

  it("blocks cross-origin mutations and disallowed methods", () => {
    const cross = new Request("https://mia.test/api/x", { method: "POST", headers: { host: "mia.test", origin: "https://evil.test" } });
    const blocked = guardMutation(cross, ["POST"]);
    expect(!blocked.ok && blocked.response.status).toBe(403);
    const wrong = guardMutation(new Request("https://mia.test/api/x", { method: "PUT" }), ["POST"]);
    expect(!wrong.ok && wrong.response.status).toBe(405);
  });

  it("passes same-origin requests and derives the owner from the cookie only", () => {
    const token = generateOwnerToken();
    const request = new Request("https://mia.test/api/x", {
      method: "POST",
      headers: { host: "mia.test", origin: "https://mia.test", cookie: `${OWNER_COOKIE}=${token}`, "x-real-ip": "9.9.9.9" },
    });
    const guard = guardMutation(request, ["POST"]);
    expect(guard).toEqual({ ok: true, ownerId: hashOwnerToken(token), ip: "9.9.9.9" });
  });

  it("maps any thrown error to a safe 503 with no internal details", async () => {
    const response = safeErrorResponse(new Error("P1001 can't reach db.railway.internal:5432 password=hunter2"));
    expect(response.status).toBe(503);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("Mia can’t reach the database right now");
    expect(text).not.toMatch(/P1001|railway|5432|hunter2/);
  });
});

describe("message validation", () => {
  it("rejects empty and whitespace-only messages", () => {
    expect(validateMessage("").ok).toBe(false);
    expect(validateMessage("   \n\t ").ok).toBe(false);
    expect(validateMessage(undefined).ok).toBe(false);
  });

  it("trims accepted text and strips control characters", () => {
    expect(validateMessage("  hello\u0000 there \n")).toEqual({ ok: true, value: "hello there" });
  });

  it("accepts exactly 2000 characters and rejects 2001 with a friendly message", () => {
    expect(validateMessage("a".repeat(2000)).ok).toBe(true);
    const long = validateMessage("a".repeat(2001));
    expect(long.ok).toBe(false);
    expect(!long.ok && long.errors.message).toMatch(/too long.*2000/);
  });
});

describe("chat titles", () => {
  it("collapses whitespace and line breaks and removes control characters", () => {
    expect(makeChatTitle("  What   helps\n\nwith\thay\u0007 fever?  ")).toBe("What helps with hay fever?");
  });

  it("keeps a 40-character title intact", () => {
    const text = "a".repeat(40);
    expect(makeChatTitle(text)).toBe(text);
  });

  it("truncates to 39 characters plus an ellipsis", () => {
    const title = makeChatTitle("b".repeat(80));
    expect(title).toBe(`${"b".repeat(39)}…`);
    expect(Array.from(title)).toHaveLength(40);
  });

  it("falls back to New chat when nothing remains", () => {
    expect(makeChatTitle(" \n ")).toBe("New chat");
  });
});

describe("settings validation", () => {
  it("accepts valid settings including the range boundaries", () => {
    expect(validateSettings({ model: "CLAUDE_STYLE", temperature: 0, topP: 1 }).ok).toBe(true);
  });

  it("rejects an unknown model and out-of-range or non-finite numbers", () => {
    const bad = validateSettings({ model: "GPT-5", temperature: 1.1, topP: Number.NaN });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && Object.keys(bad.errors).sort()).toEqual(["model", "temperature", "topP"]);
    expect(validateSettings({ model: "LLAMA_STYLE", temperature: -0.1, topP: 0.5 }).ok).toBe(false);
    expect(validateSettings({ model: "LLAMA_STYLE", temperature: "0.5", topP: 0.5 }).ok).toBe(false);
    expect(validateSettings({ model: "LLAMA_STYLE", temperature: Infinity, topP: 0.5 }).ok).toBe(false);
  });

  it("supports partial updates", () => {
    expect(validateSettings({ temperature: 0.3 }, true)).toEqual({ ok: true, value: { temperature: 0.3 } });
    expect(validateSettings({ topP: 2 }, true).ok).toBe(false);
  });
});

describe("product and persona validation", () => {
  const product = { name: "Balm", activeSubstance: "x", category: "Skin", useFor: "Dry skin", howToUse: "Apply", tip: "" };

  it("accepts a valid product and trims fields", () => {
    expect(validateProductInput({ ...product, name: "  Balm  " })).toEqual({ ok: true, value: product });
  });

  it("enforces every field-length boundary", () => {
    const limits: [keyof typeof product, number][] = [
      ["name", 100], ["activeSubstance", 100], ["category", 50], ["useFor", 200], ["howToUse", 300], ["tip", 300],
    ];
    for (const [field, max] of limits) {
      expect(validateProductInput({ ...product, [field]: "a".repeat(max) }).ok).toBe(true);
      const over = validateProductInput({ ...product, [field]: "a".repeat(max + 1) });
      expect(over.ok).toBe(false);
      expect(!over.ok && over.errors[field]).toMatch(new RegExp(`at most ${max}`));
    }
  });

  it("rejects whitespace-only required fields but allows an empty tip", () => {
    for (const field of ["name", "activeSubstance", "category", "useFor", "howToUse"] as const) {
      const result = validateProductInput({ ...product, [field]: "   " });
      expect(result.ok).toBe(false);
      expect(!result.ok && result.errors[field]).toMatch(/required/);
    }
    expect(validateProductInput({ ...product, tip: "   " }).ok).toBe(true);
  });

  it("validates personas (name 40, content 1000, required)", () => {
    expect(validatePersonaInput({ name: "a".repeat(40), content: "b".repeat(1000) }).ok).toBe(true);
    expect(validatePersonaInput({ name: "a".repeat(41), content: "b" }).ok).toBe(false);
    expect(validatePersonaInput({ name: "a", content: "b".repeat(1001) }).ok).toBe(false);
    expect(validatePersonaInput({ name: " ", content: "b" }).ok).toBe(false);
  });
});

describe("quiz result validation", () => {
  it("accepts integer scores 0..5 with total 5", () => {
    for (let score = 0; score <= 5; score++) expect(validateQuizResult({ score, total: 5 }).ok).toBe(true);
  });

  it.each([
    [{ score: 6, total: 5 }],
    [{ score: -1, total: 5 }],
    [{ score: 3, total: 4 }],
    [{ score: 2.5, total: 5 }],
    [{ score: "3", total: 5 }],
    [{ score: 3 }],
    [{ score: 3, total: 5, ownerId: "x" }],
    [null],
    [[3, 5]],
    ["3/5"],
  ])("rejects %j", (body) => {
    expect(validateQuizResult(body).ok).toBe(false);
  });
});
