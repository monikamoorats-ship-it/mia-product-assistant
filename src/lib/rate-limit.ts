/**
 * In-memory rate and concurrency limiters.
 *
 * LIMITATIONS (also documented in the README): state resets when the app
 * restarts or deploys, is not shared between Railway instances, and only
 * reduces casual abuse. It is not production-grade protection.
 */

export type LimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

type Clock = () => number;

/** Sliding-window counter: at most `limit` hits per `windowMs` per key. */
export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: Clock = Date.now,
  ) {}

  /** Records a hit when allowed. Rejected attempts are not recorded. */
  hit(key: string): LimitDecision {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      const retryAfterMs = this.windowMs - (now - recent[0]);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    this.prune(now);
    return { allowed: true };
  }

  private prune(now: number) {
    if (this.hits.size < 5000) return;
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(key);
    }
  }
}

/** At most `limit` simultaneously active operations per key. */
export class ConcurrencyLimiter {
  private active = new Map<string, number>();

  constructor(private readonly limit: number) {}

  /** Returns a release function, or null when the key is at its limit. */
  acquire(key: string): (() => void) | null {
    const current = this.active.get(key) ?? 0;
    if (current >= this.limit) return null;
    this.active.set(key, current + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = (this.active.get(key) ?? 1) - 1;
      if (next <= 0) this.active.delete(key);
      else this.active.set(key, next);
    };
  }
}

export const LIMITS = {
  generationPerMinute: 20,
  newOwnersPerHourPerIp: 10,
  activePerOwner: 2,
  activePerIp: 5,
} as const;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export type GenerationGate =
  | { ok: true; release: () => void }
  | { ok: false; retryAfterSeconds: number };

/**
 * Guards message generation: rate limits per owner and per IP, plus a cap on
 * concurrently running generations. Call BEFORE the artificial delay and
 * before any database write; always call `release()` when finished.
 */
export class GenerationLimiter {
  private ownerRate: SlidingWindowLimiter;
  private ipRate: SlidingWindowLimiter;
  private ownerActive = new ConcurrencyLimiter(LIMITS.activePerOwner);
  private ipActive = new ConcurrencyLimiter(LIMITS.activePerIp);

  constructor(now: Clock = Date.now) {
    this.ownerRate = new SlidingWindowLimiter(LIMITS.generationPerMinute, MINUTE, now);
    this.ipRate = new SlidingWindowLimiter(LIMITS.generationPerMinute, MINUTE, now);
  }

  acquire(ownerId: string, ip: string): GenerationGate {
    const ownerRelease = this.ownerActive.acquire(ownerId);
    if (!ownerRelease) return { ok: false, retryAfterSeconds: 2 };
    const ipRelease = this.ipActive.acquire(ip);
    if (!ipRelease) {
      ownerRelease();
      return { ok: false, retryAfterSeconds: 2 };
    }
    const release = () => {
      ownerRelease();
      ipRelease();
    };
    const ownerDecision = this.ownerRate.hit(ownerId);
    if (!ownerDecision.allowed) {
      release();
      return { ok: false, retryAfterSeconds: ownerDecision.retryAfterSeconds };
    }
    const ipDecision = this.ipRate.hit(ip);
    if (!ipDecision.allowed) {
      release();
      return { ok: false, retryAfterSeconds: ipDecision.retryAfterSeconds };
    }
    return { ok: true, release };
  }
}

/** At most 10 newly issued anonymous owner cookies per hour per IP. */
export class NewOwnerLimiter {
  private limiter: SlidingWindowLimiter;

  constructor(now: Clock = Date.now) {
    this.limiter = new SlidingWindowLimiter(LIMITS.newOwnersPerHourPerIp, HOUR, now);
  }

  hit(ip: string): LimitDecision {
    return this.limiter.hit(ip);
  }
}

// Process-wide instances (see limitations above).
const globalForLimits = globalThis as unknown as {
  miaGenerationLimiter?: GenerationLimiter;
  miaNewOwnerLimiter?: NewOwnerLimiter;
};

export const generationLimiter = (globalForLimits.miaGenerationLimiter ??= new GenerationLimiter());
export const newOwnerLimiter = (globalForLimits.miaNewOwnerLimiter ??= new NewOwnerLimiter());
