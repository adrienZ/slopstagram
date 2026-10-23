import { defineConfig } from "oxlint";
import ultracite from "ultracite/oxlint/core";
import antiSlop from "ultracite/oxlint/anti-slop";

const restrictedReactImports = [
  {
    // frontend-side-effects
    name: "react",
    importNames: ["useEffect", "useLayoutEffect", "useInsertionEffect"],
    allowTypeImports: false,
    message: "useEffect is forbidden. Use derived state or explicit event subscriptions.",
  },
];

const ultraciteSoftenerConfig = defineConfig({
  rules: {
    "import/consistent-type-specifier-style": ["error", "prefer-top-level-if-only-type-imports"],
    "typescript/array-type": ["error", { default: "generic" }],
    "func-style": ["error", "declaration"],
    "oxc/no-barrel-file": ["error", { threshold: 0 }],
    "sort-keys": "off",
    // This flags concurrency opportunities, but retries, rate limits, and resource-heavy work may require serial awaits.
    "no-await-in-loop": "warn",
    // require-await only when useful using type aware rule
    "require-await": "off",
    "typescript/require-await": "error",
  },
});

export default defineConfig({
  extends: [ultracite, antiSlop, ultraciteSoftenerConfig],
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), "server/routeTree.gen.ts"],
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
    perf: "error",
  },
  rules: {
    "slopstagram/no-barrel-files": "error",
    "no-restricted-imports": [
      "error",
      {
        paths: restrictedReactImports,
      },
    ],
  },
  overrides: [
    {
      files: ["scripts/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: restrictedReactImports,
            patterns: [
              {
                group: ["**/database/migrate*", "drizzle-orm/**/migrator"],
                message:
                  "Scripts require an initialized database. Run migrations at server startup in server/plugins/database.ts.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["sdk/index.ts"],
      rules: {
        "slopstagram/no-barrel-files": "off",
      },
    },
    {
      files: [
        "tests/**/*.test.ts",
        "tests/**/*.spec.ts",
        "tests/repository-adapters.ts",
        "tests/mock-helpers.ts",
      ],
      rules: {
        // oxlint-disable-next-line no-warning-comments
        // TODO: Enable require-await rule
        "typescript/require-await": "off",
        "typescript/no-floating-promises": [
          "error",
          {
            allowForKnownSafeCalls: [
              { from: "package", name: ["describe", "test"], package: "vitest" },
            ],
          },
        ],
      },
    },
  ],
});
