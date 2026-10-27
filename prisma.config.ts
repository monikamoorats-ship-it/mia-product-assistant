import { defineConfig } from "prisma/config";

// DATABASE_URL is only read by commands that connect (migrate, seed).
// `prisma generate` and `next build` must work without a database.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
