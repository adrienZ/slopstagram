import { defineConfig } from "oxlint";
import ultracite from "ultracite/oxlint/core";
import antiSlop from "ultracite/oxlint/anti-slop";

interface RestrictedPath {
  name: string;
  message: string;
  allowTypeImports?: boolean;
  importNames?: Array<string>;
}

interface RestrictedPattern {
  group: Array<string>;
  message: string;
  allowTypeImports?: boolean;
  importNames?: Array<string>;
}

const restrictedReactPaths: Array<RestrictedPath> = [
  {
    // frontend-side-effects
    name: "react",
    importNames: ["useEffect", "useLayoutEffect", "useInsertionEffect", "useCallback"],
    allowTypeImports: false,
    message:
      "useEffect is forbidden. Use derived state or explicit event subscriptions. https://react.dev/learn/you-might-not-need-an-effect",
  },
  {
    name: "react",
    importNames: ["*"],
    allowTypeImports: false,
    message: "Use named React imports instead of namespace imports.",
  },
];

// Which modules a file may import is checked by dependency-cruiser (.dependency-cruiser.mjs). It sees
// modules, not names, so the names only the composition root (core/domains/runtime) may take stay here.
const compositionRootPaths: Array<RestrictedPath> = [
  {
    name: "unstorage",
    importNames: ["createStorage"],
    message: "Only the composition root opens a store. Take the runtime as a parameter.",
  },
];

const compositionRootPatterns: Array<RestrictedPattern> = [
  {
    group: ["**/database/client.ts"],
    importNames: ["createDrizzle"],
    message:
      "Only the composition root (core/domains/runtime) opens the database. Take the runtime as a parameter.",
  },
  {
    group: ["**/media-store/cache-storage.ts"],
    importNames: ["createFileCacheStorage"],
    message:
      "Only the composition root (core/domains/runtime) opens the stores. Take the runtime as a parameter.",
  },
];

const restrictedImports = defineConfig({
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [...restrictedReactPaths, ...compositionRootPaths],
        patterns: compositionRootPatterns,
      },
    ],
  },
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
  extends: [ultracite, antiSlop, ultraciteSoftenerConfig, restrictedImports],
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
      // The composition root, and what it builds from; tests build their own databases and stores.
      files: [
        "core/domains/runtime/**",
        "core/domains/database/**",
        "core/domains/media-store/cache-storage.ts",
        "tests/**",
      ],
      rules: { "no-restricted-imports": ["error", { paths: restrictedReactPaths }] },
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
