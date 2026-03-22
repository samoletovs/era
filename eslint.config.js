import tseslint from "typescript-eslint";
import eraPlugin from "./eslint-plugin-era.js";

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: {
      era: eraPlugin,
    },
    rules: {
      // ERA development standards enforcement (docs/development-standards.md)
      "era/field-suffixes": "warn",
      "era/doctype-required": "warn",
      "era/no-cross-partition-query": "warn",

      // Core ESLint rules aligned with ERA standards
      "no-eval": "error",                           // Security: §12
      "no-implied-eval": "error",                    // Security: §12
      "no-new-func": "error",                        // Security: §12
      "no-alert": "warn",                            // Frontend: §9 — use toast instead
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
      "eqeqeq": ["error", "always"],

      // Relax some typescript-eslint rules for ERA's patterns
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-namespace": "off",       // Needed for Express type augmentation
    },
  },
  {
    // Backend-specific rules
    files: ["src/backend/**/*.ts"],
    rules: {
      "era/no-cross-partition-query": "warn",
    },
  },
  {
    // Disable certain rules for test files
    files: ["tests/**/*.ts"],
    rules: {
      "no-console": "off",
      "era/field-suffixes": "off",
      "era/doctype-required": "off",
    },
  },
];
