/**
 * Idempotent seed, run by Railway's pre-deploy step (`npm run predeploy`).
 *
 * Records are matched only by their immutable seedKey and upserted with
 * `update: {}`, so a re-run creates missing seeded rows and never overwrites
 * anything. User-created rows (no seedKey) are never read or changed.
 * Any validation failure exits non-zero before anything is written.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { requireDatabaseUrl } from "../src/lib/env";
import { prepareSeedRecords } from "../src/lib/seed-data";

// Resolved relative to this file, independent of the current working directory.
const PRODUCTS_CSV = path.join(__dirname, "products.csv");

async function main() {
  // Validate everything first so a bad CSV never causes a partial seed.
  const { products, personas } = prepareSeedRecords(readFileSync(PRODUCTS_CSV, "utf8"));

  const adapter = new PrismaPg({ connectionString: requireDatabaseUrl() });
  const prisma = new PrismaClient({ adapter });
  try {
    await prisma.$transaction(async (tx) => {
      for (const persona of personas) {
        await tx.systemPrompt.upsert({
          where: { seedKey: persona.seedKey },
          update: {},
          create: { ...persona, ownerId: null },
        });
      }
      for (const product of products) {
        await tx.product.upsert({
          where: { seedKey: product.seedKey },
          update: {},
          create: { ...product, ownerId: null },
        });
      }
    });
    console.log(`Seed complete: ${personas.length} personas, ${products.length} products checked.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Print only our own validation/config messages, never connection details.
  const known =
    error instanceof Error && (error.name === "SeedValidationError" || error.name === "ConfigError");
  const message = known ? (error as Error).message : "Unexpected failure while seeding.";
  console.error(`Seed failed: ${message}`);
  process.exit(1);
});
