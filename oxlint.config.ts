import { defineConfig } from "oxlint";

const antiSlop = import.meta.resolve("oxlint-plugin-anti-slop");

export default defineConfig({
  ignorePatterns: [".agents/**"],
  jsPlugins: [
    "./oxlint/plugins/rules/no-barrel-files.ts",
    { name: "anti-slop", specifier: antiSlop },
  ],
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
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
    "oxc/no-barrel-file": ["error", { threshold: 0 }],
    "slopstagram/no-barrel-files": "error",
    "typescript/prefer-readonly-parameter-types": "off",
    "typescript/no-floating-promises": [
      "error",
      {
        allowForKnownSafeCalls: [
          { from: "package", name: ["describe", "test"], package: "node:test" },
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
