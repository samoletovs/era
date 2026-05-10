import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Integration test config. Separate from vitest.config.ts so unit tests stay fast
 * and don't accidentally pick up the global cosmos mock.
 */
export default defineConfig({
  pool: "forks",
  poolOptions: {
    forks: {
      singleFork: true,
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/integration/_harness/setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
      "@backend": path.resolve(__dirname, "src/backend"),
    },
  },
});
