/**
 * Shared setup for database integration tests. Refuses to run unless the
 * test-database safeguards pass; never reads or prints DATABASE_URL.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { assertSafeTestDatabase } from "@/lib/test-db-guard";

export const testUrl = assertSafeTestDatabase();
export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }) });

const ROOT = path.resolve(__dirname, "../..");

export function runSeed() {
  return spawnSync("npx", ["tsx", "prisma/seed.ts"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: testUrl },
    encoding: "utf8",
    shell: true,
  });
}

/** Empties every table, then restores the seeded personas and products. */
export async function resetAndSeed() {
  await prisma.message.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.quizResult.deleteMany();
  await prisma.product.deleteMany();
  await prisma.systemPrompt.deleteMany();
  const result = runSeed();
  if (result.status !== 0) throw new Error("Seeding the test database failed.");
}

export const OWNER_A = "a".repeat(64);
export const OWNER_B = "b".repeat(64);

export async function customProduct(ownerId: string, over: Partial<{ name: string; useFor: string; tip: string; activeSubstance: string }> = {}) {
  return prisma.product.create({
    data: {
      ownerId,
      name: over.name ?? "Custom balm",
      activeSubstance: over.activeSubstance ?? "balmium",
      category: "Skin",
      useFor: over.useFor ?? "Dry skin",
      howToUse: "Apply thinly",
      tip: over.tip ?? "Wash your hands afterwards",
    },
  });
}
