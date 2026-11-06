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

// Source files import through the tsconfig aliases, never relatively: `@/` for app/, `@@/` for the rest.
const aliasImports: RestrictedPattern = {
  group: ["./*", "../*"],
  message:
    "Import through the tsconfig aliases, not relative paths: `@/utils/helper.ts` for app/, `@@/core/...` for the rest.",
};

// The helpers of a repository are named `<repository>.<aspect>.ts` next to it. They take the database
// or a transaction handle, and only their repository may import them.
const privateRepositoryHelpers: RestrictedPattern = {
  group: ["**/story-repository.*.ts"],
  message:
    "story-repository.<aspect>.ts holds helpers private to story-repository.ts. Call the repository method instead of importing the helper.",
};

// Only the composition root, core/domains/runtime, builds what holds state: the repositories, the database and the stores.
const compositionRootPaths: Array<RestrictedPath> = [
  {
    name: "node:sqlite",
    message: "Only the composition root opens the database. Take the runtime as a parameter.",
  },
  {
    name: "unstorage",
    importNames: ["createStorage"],
    message: "Only the composition root opens a store. Take the runtime as a parameter.",
  },
];

const compositionRootPatterns: Array<RestrictedPattern> = [
  {
    group: ["**/database/repositories/*-repository.ts"],
    allowTypeImports: true,
    message:
      "Only the composition root (core/domains/runtime) constructs repositories. Take the runtime as a parameter and import the type only.",
  },
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

// Oxlint replaces a rule's options instead of merging them, so every `no-restricted-imports`
// entry must carry the react paths, the composition root restrictions and the private helpers itself.
function restrictImports(
  patterns: Array<RestrictedPattern> = [],
  { root = false }: { root?: boolean } = {},
): ["error", { paths: Array<RestrictedPath>; patterns: Array<RestrictedPattern> }] {
  return [
    "error",
    {
      paths: root ? restrictedReactPaths : [...restrictedReactPaths, ...compositionRootPaths],
      patterns: [
        ...patterns,
        aliasImports,
        ...(root ? [] : compositionRootPatterns),
        privateRepositoryHelpers,
      ],
    },
  ];
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
    "slopstagram/ai-sdk-imports": "error",
  },
  overrides: [
    {
      // The composition root, and what it builds from; tests build their own repositories, databases and stores.
      files: [
        "core/domains/runtime/**",
        "core/domains/database/**",
        "core/domains/media-store/cache-storage.ts",
        "tests/**",
      ],
      rules: { "no-restricted-imports": restrictImports([], { root: true }) },
    },
    {
      // The only importer of its helpers.
      files: ["core/domains/database/repositories/story-repository.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          { paths: restrictedReactPaths, patterns: [aliasImports] },
        ],
      },
    },
    {
      files: ["scripts/**/*.ts"],
      rules: {
        "no-restricted-imports": restrictImports([
          {
            group: ["**/database/migrate*", "drizzle-orm/**/migrator"],
            message:
              "Scripts require an initialized database. Run migrations at server startup in nitro/plugins/database.ts.",
          },
        ]),
      },
    },
    {
      files: ["app/routes/**", "app/components/**", "app/hooks/**", "app/utils/**"],
      rules: {
        "no-restricted-imports": restrictImports([
          {
            group: ["@@/core/domains/database/repositories/*", "@@/core/domains/database/*"],
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
