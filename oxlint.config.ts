import { defineConfig } from "oxlint";
import ultracite from "ultracite/oxlint/core";
import antiSlop from "ultracite/oxlint/anti-slop";

interface RestrictedPattern {
  group: Array<string>;
  message: string;
  allowTypeImports?: boolean;
}

const restrictedReactPaths = [
  {
    // frontend-side-effects
    name: "react",
    importNames: ["useEffect", "useLayoutEffect", "useInsertionEffect", "useCallback"],
    allowTypeImports: false,
    message: "useEffect is forbidden. Use derived state or explicit event subscriptions.",
  },
  {
    name: "react",
    importNames: ["*"],
    allowTypeImports: false,
    message: "Use named React imports instead of namespace imports.",
  },
];

// Oxlint replaces a rule's options instead of merging them, so every
// `no-restricted-imports` entry must carry the react paths itself.
function restrictImports(
  patterns: Array<RestrictedPattern> = [],
): ["error", { paths: typeof restrictedReactPaths; patterns: Array<RestrictedPattern> }] {
  return ["error", { paths: restrictedReactPaths, patterns }];
}

const restrictedReactImports = defineConfig({
  rules: { "no-restricted-imports": restrictImports() },
});

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
  extends: [ultracite, antiSlop, ultraciteSoftenerConfig, restrictedReactImports],
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    ".agents/**",
    ".claude/**",
    "app/routeTree.gen.ts",
    "app/shadcn/**",
  ],
  jsPlugins: ["./oxlint/plugins/slopstagram.ts"],
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
    "slopstagram/domain-layering": "error",
  },
  overrides: [
    {
      files: ["scripts/**/*.ts"],
      rules: {
        "no-restricted-imports": restrictImports([
          {
            group: ["**/database/migrate*", "drizzle-orm/**/migrator"],
            message:
              "Scripts require an initialized database. Run migrations at server startup in server/plugins/database.ts.",
          },
        ]),
      },
    },
    {
      files: ["app/routes/**", "app/components/**", "app/hooks/**", "app/utils/**"],
      rules: {
        "no-restricted-imports": restrictImports([
          {
            group: ["@@/core/database/repositories/*", "@@/core/database/*"],
            allowTypeImports: true,
            message:
              "Pages and components get their data from a loader. Import types only, not repositories or the database client.",
          },
        ]),
      },
    },
    {
      files: [
        "tests/**/*.test.ts",
        "tests/**/*.test.tsx",
        "tests/**/*.spec.ts",
        "tests/mock-helpers.ts",
      ],
      rules: {
        // Sonar (typescript:S2699) only counts `expect` as an assertion. `assert.ok` stays for type narrowing.
        "no-restricted-properties": [
          "error",
          {
            object: "assert",
            allowProperties: ["ok"],
            message: "Use expect instead of assert, except assert.ok for type narrowing.",
          },
        ],
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
