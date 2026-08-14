import { defineConfig } from "oxlint";

export default defineConfig({
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
    // perf: "error",
  },
  rules: {
    "oxc/no-barrel-file": ["error", { threshold: 0 }],
    "slopstagram/no-barrel-files": "error",
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
      },
    },
  ],
});
