import eraPlugin from "./eslint-plugin-era.js";

/** @type {import('eslint').Linter.Config[]} */
export default [
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
