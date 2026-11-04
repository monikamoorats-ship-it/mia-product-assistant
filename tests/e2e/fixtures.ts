import { test as base, expect } from "@playwright/test";

let counter = 0;

/**
 * Off Railway there is no X-Real-IP header, so every request would share one
 * rate-limit bucket ("unknown") and the per-IP limits would trip after a few
 * tests. Each test therefore presents its own client IP, as separate real
 * visitors behind Railway's edge would.
 */
export const test = base.extend<{ uniqueIp: void }>({
  uniqueIp: [
    async ({ context }, use) => {
      counter += 1;
      await context.setExtraHTTPHeaders({ "x-real-ip": `10.${Math.floor(counter / 250) % 250}.${counter % 250}.${(counter * 7) % 250 + 1}` });
      await use();
    },
    { auto: true },
  ],
});

export { expect };
