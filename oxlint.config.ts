import { defineConfig } from "oxlint";

export default defineConfig({
  options: {
    maxWarnings: 0,
    typeAware: true,
    typeCheck: true,
  },
  rules: {
    "typescript/no-floating-promises": [
      "error",
      {
        allowForKnownSafeCalls: [
          { from: "package", name: ["describe", "test"], package: "node:test" },
        ],
      },
    ],
  },
});
