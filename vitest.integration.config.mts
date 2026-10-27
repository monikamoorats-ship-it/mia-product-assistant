import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Database integration tests. Run only in GitHub Actions against a disposable PostgreSQL service.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
