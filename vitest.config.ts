import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**", "node_modules/**", "dist/**"],
    coverage: {
      reporter: ["text", "lcov"],
      include: ["src/backend/services/**"],
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
      "@backend": path.resolve(__dirname, "src/backend"),
    },
  },
});
