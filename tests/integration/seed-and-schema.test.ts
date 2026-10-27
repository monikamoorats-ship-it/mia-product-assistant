/**
 * Database integration tests for slice 1. These run ONLY in GitHub Actions
 * against a disposable PostgreSQL service container. The guard below refuses
 * to run unless every safety condition holds, and never touches DATABASE_URL.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { assertSafeTestDatabase } from "@/lib/test-db-guard";

const testUrl = assertSafeTestDatabase();
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }) });
const ROOT = path.resolve(__dirname, "../..");

function runSeed() {
  // The seed reads DATABASE_URL; point it at the disposable test database only.
  const result = spawnSync("npx", ["tsx", "prisma/seed.ts"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: testUrl },
    encoding: "utf8",
    shell: true,
  });
  return result;
}

async function resetTables() {
  await prisma.message.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.quizResult.deleteMany();
  await prisma.product.deleteMany();
  await prisma.systemPrompt.deleteMany();
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(resetTables);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("seed", () => {
  it("creates 3 personas and 7 products", async () => {
    expect(runSeed().status).toBe(0);
    expect(await prisma.systemPrompt.count()).toBe(3);
    expect(await prisma.product.count()).toBe(7);
  });

  it("is idempotent: a second run creates no duplicates", async () => {
    expect(runSeed().status).toBe(0);
    expect(runSeed().status).toBe(0);
    expect(await prisma.systemPrompt.count()).toBe(3);
    expect(await prisma.product.count()).toBe(7);
  });

  it("never overwrites edits to seeded rows", async () => {
    runSeed();
    await prisma.product.update({ where: { seedKey: "ibuprofen-400mg-tablets" }, data: { tip: "Edited tip" } });
    await prisma.systemPrompt.update({ where: { seedKey: "customer-guide" }, data: { name: "Shopper" } });
    expect(runSeed().status).toBe(0);
    expect((await prisma.product.findUnique({ where: { seedKey: "ibuprofen-400mg-tablets" } }))?.tip).toBe("Edited tip");
    // Renamed persona is still recognised by its key: nothing is re-created.
    expect(await prisma.systemPrompt.count()).toBe(3);
    expect((await prisma.systemPrompt.findUnique({ where: { seedKey: "customer-guide" } }))?.name).toBe("Shopper");
  });

  it("restores a deleted seeded row and leaves user-created rows alone", async () => {
    runSeed();
    const custom = await prisma.product.create({
      data: {
        ownerId: "a".repeat(64),
        name: "My product",
        activeSubstance: "x",
        category: "y",
        useFor: "z",
        howToUse: "w",
      },
    });
    await prisma.product.delete({ where: { seedKey: "loperamide-2mg-capsules" } });
    expect(runSeed().status).toBe(0);
    expect(await prisma.product.count()).toBe(8);
    const after = await prisma.product.findUnique({ where: { id: custom.id } });
    expect(after?.name).toBe("My product");
    expect(after?.seedKey).toBeNull();
  });
});

describe("schema constraints", () => {
  const owner = "b".repeat(64);

  it("allows only one empty chat session per owner", async () => {
    await prisma.chatSession.create({ data: { ownerId: owner } });
    await expect(prisma.chatSession.create({ data: { ownerId: owner } })).rejects.toThrow();
    await prisma.chatSession.create({ data: { ownerId: "c".repeat(64) } });
  });

  it("rejects out-of-range temperature and top-p", async () => {
    await expect(prisma.chatSession.create({ data: { ownerId: owner, temperature: 1.5, messageCount: 1 } })).rejects.toThrow();
    await expect(prisma.chatSession.create({ data: { ownerId: owner, topP: -0.1, messageCount: 1 } })).rejects.toThrow();
  });

  it("rejects quiz results that are not out of 5 or have an impossible score", async () => {
    await expect(prisma.quizResult.create({ data: { ownerId: owner, score: 3, total: 4 } })).rejects.toThrow();
    await expect(prisma.quizResult.create({ data: { ownerId: owner, score: 6, total: 5 } })).rejects.toThrow();
    await prisma.quizResult.create({ data: { ownerId: owner, score: 5, total: 5 } });
  });

  it("rejects more than three product snapshots on a message", async () => {
    const session = await prisma.chatSession.create({ data: { ownerId: owner, messageCount: 1 } });
    await expect(
      prisma.message.create({
        data: { sessionId: session.id, role: "assistant", content: "x", productSnapshots: [{}, {}, {}, {}] },
      }),
    ).rejects.toThrow();
  });

  it("cascades message deletion with the chat and nulls the persona on delete", async () => {
    const persona = await prisma.systemPrompt.create({ data: { ownerId: owner, name: "Mine", content: "c" } });
    const session = await prisma.chatSession.create({
      data: { ownerId: owner, systemPromptId: persona.id, messageCount: 1 },
    });
    await prisma.message.create({ data: { sessionId: session.id, role: "user", content: "hi" } });
    await prisma.systemPrompt.delete({ where: { id: persona.id } });
    expect((await prisma.chatSession.findUnique({ where: { id: session.id } }))?.systemPromptId).toBeNull();
    await prisma.chatSession.delete({ where: { id: session.id } });
    expect(await prisma.message.count()).toBe(0);
  });

  it("keeps seeded persona names unique", async () => {
    await prisma.systemPrompt.create({ data: { seedKey: "k1", name: "Same", content: "c" } });
    await expect(prisma.systemPrompt.create({ data: { seedKey: "k2", name: "Same", content: "c" } })).rejects.toThrow();
  });
});
