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

// Value imports between core domains point down this table. Type-only imports are always
// allowed, and fetch-run sits on top: it may import any domain and no domain imports it.
const domainDependencies = {
  utils: [],
  database: ["utils"],
  instagram: ["database", "utils"],
  "media-store": ["utils"],
  stickers: ["database", "utils"],
  places: ["database", "utils"],
  music: ["database", "media-store", "utils"],
  vision: ["database", "media-store", "utils"],
  accounts: ["database", "vision", "utils"],
  "story-feed": ["database", "vision", "utils"],
} satisfies Record<string, Array<string>>;
const dependencyTable = new Map<string, Array<string>>(Object.entries(domainDependencies));
const coreDomains = [...dependencyTable.keys(), "fetch-run"];

// Baseline of the violations that exist today, per importing module. It can only shrink: a new
// violation fails lint. The repository shape spec (#157) and the composition root spec (#159)
// remove them.
const domainViolations = {
  // #157: the report entity imports the story media types, which belong to stickers.
  "core/database/entities/report.ts": ["stickers"],
  // #157: repositories call the planners of the domains they persist.
  "core/database/repositories/location-metadata-repository.ts": ["places"],
  "core/database/repositories/music-metadata-repository.ts": ["music"],
  // #157: the report repository validates payloads and reads story output.
  "core/database/repositories/report-repository.ts": ["fetch-run", "instagram"],
  // #157: the story repository calls the annotation, audio and payload planners.
  "core/database/repositories/story-repository.ts": ["instagram", "music", "stickers"],
  // #159: stickers, places and music import each other through sticker and location extraction.
  "core/places/location-metadata.ts": ["stickers"],
  "core/stickers/story-sticker-location.ts": ["music", "places"],
} satisfies Record<string, Array<string>>;

function restrictDomainImports(domain: string, allowed: Array<string>): RestrictedPattern {
  const forbidden = coreDomains.filter((other) => other !== domain && !allowed.includes(other));
  return {
    group: forbidden.map((other) => `@@/core/${other}/*`),
    allowTypeImports: true,
    message: `Core domains import only the domains below them (see domainDependencies in oxlint.config.ts). Import types only, or move the code.`,
  };
}

const domainLayeringOverrides = [
  ...[...dependencyTable].map(([domain, allowed]) => ({
    files: [`core/${domain}/**`],
    rules: { "no-restricted-imports": restrictImports([restrictDomainImports(domain, allowed)]) },
  })),
  ...Object.entries(domainViolations).map(([file, extra]) => {
    const domain = /^core\/(?<domain>[^/]+)\//u.exec(file)?.groups?.domain ?? "";
    return {
      files: [file],
      rules: {
        "no-restricted-imports": restrictImports([
          restrictDomainImports(domain, [...(dependencyTable.get(domain) ?? []), ...extra]),
        ]),
      },
    };
  }),
];

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
  },
  overrides: [
    ...domainLayeringOverrides,
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
