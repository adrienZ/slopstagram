import { defineConfig } from "oxlint";

export default defineConfig({
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
    // perf: "error",
  },
  rules: {
    "typescript/prefer-readonly-parameter-types": "off",
    "typescript/no-floating-promises": [
      "error",
      {
        allowForKnownSafeCalls: [
          { from: "package", name: ["describe", "test"], package: "bun:test" },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ["tests/**/*.test.ts"],
      rules: {
        "max-lines-per-function": "off",
      },
    },
  ],
});
