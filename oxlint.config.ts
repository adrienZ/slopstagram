import { defineConfig } from "oxlint";
import ultracite from "ultracite/oxlint/core";
import antiSlop from "ultracite/oxlint/anti-slop";

const ultraciteSoftenerConfig = defineConfig({
  rules: {
    "import/consistent-type-specifier-style": ["error", "prefer-top-level-if-only-type-imports"],
    "typescript/array-type": ["error", { default: "generic" }],
    "func-style": ["error", "declaration"],
    "sort-keys": "off",
  },
});

export default defineConfig({
  extends: [ultracite, antiSlop, ultraciteSoftenerConfig],
  ignorePatterns: ultracite.ignorePatterns,
  jsPlugins: ["./oxlint/plugins/rules/no-barrel-files.ts"],
  options: {
    maxWarnings: 0,
    typeAware: true,
    typeCheck: true,
  },
  categories: {
    correctness: "error",
    suspicious: "error",
    pedantic: "error",
    nursery: "error",
    // perf: "off",
  },
  rules: {
    "oxc/no-barrel-file": ["error", { threshold: 0 }],
    "slopstagram/no-barrel-files": "error",
    "typescript/promise-function-async": "off",
    // temp rules
    "no-await-in-loop": "off",
  },
  overrides: [
    {
      files: ["sdk/index.ts"],
      rules: {
        "oxc/no-barrel-file": "off",
        "slopstagram/no-barrel-files": "off",
      },
    },
    {
      files: ["tests/**/*.test.ts"],
      rules: {
        "max-lines-per-function": "off",
        "typescript/no-floating-promises": [
          "error",
          {
            allowForKnownSafeCalls: [
              { from: "package", name: ["describe", "test"], package: "node:test" },
            ],
          },
        ],
      },
    },
  ],
});
