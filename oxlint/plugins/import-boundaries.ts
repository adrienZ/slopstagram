// Who may import what, read by the slopstagram/import-boundaries rule. Paths are globs relative to
// the repository root; aliased (`@@/`, `@/`) and relative specifiers are resolved before matching,
// packages are matched as written.
export interface Boundary {
  name: string;
  importers: Array<string>;
  except?: Array<string>;
  forbid: Array<string>;
  // Under verbatimModuleSyntax only `import type` and `export type` declarations are erased: an
  // inline `import { type A } from "x"` still compiles to `import "x"` and loads the module.
  allow?: "import-type";
  // Forbid only these exported names instead of the whole module.
  names?: Array<string>;
  because: string;
}

// The composition root, and what it builds from; tests build their own repositories, databases and stores.
const compositionRoot = [
  "core/domains/runtime/**",
  "core/domains/database/**",
  "core/domains/media-store/cache-storage.ts",
  "tests/**",
];

const pages = ["app/routes/**", "app/components/**", "app/hooks/**", "app/utils/**"];

export const boundaries: Array<Boundary> = [
  {
    name: "assistant-client-seam",
    importers: ["app/**"],
    except: ["app/routes/api/**"],
    forbid: ["core/domains/assistant/**"],
    allow: "import-type",
    because:
      "Only server routes (app/routes/api) may import values from core/domains/assistant: use `import type`. See docs/adr/0007-assistant-tools-live-in-their-domain.md.",
  },
  {
    name: "assistant-tool-modules",
    importers: ["app/**"],
    forbid: ["**/*.tool", "**/*.tool.ts"],
    because:
      "The app never imports an Assistant tool module (*.tool.ts): go through core/domains/assistant. See docs/adr/0007-assistant-tools-live-in-their-domain.md.",
  },
  {
    name: "ai-sdk",
    importers: ["**"],
    except: [
      "**/*.tool.ts",
      "core/domains/assistant/**",
      "app/hooks/use-assistant-chat.ts",
      "tests/**",
      // The LLM judge is an AI SDK provider.
      "evals/**",
    ],
    forbid: [
      "ai",
      "ai/**",
      "@ai-sdk/**",
      "ai-sdk-ollama",
      "ai-sdk-ollama/**",
      "ai-sdk-provider-*",
      "ai-sdk-provider-*/**",
    ],
    because:
      "Only Assistant tool modules (*.tool.ts), core/domains/assistant, app/hooks/use-assistant-chat.ts, tests and evals may import the AI SDK. See docs/adr/0007-assistant-tools-live-in-their-domain.md.",
  },
  {
    name: "loader-only-database",
    importers: pages,
    forbid: ["core/domains/database/*", "core/domains/database/repositories/*"],
    allow: "import-type",
    because:
      "Pages and components get their data from a loader. Import types only, not repositories or the database client.",
  },
  {
    name: "composition-root-database",
    importers: ["**"],
    except: compositionRoot,
    forbid: ["node:sqlite"],
    because: "Only the composition root opens the database. Take the runtime as a parameter.",
  },
  {
    name: "composition-root-drizzle",
    importers: ["**"],
    except: compositionRoot,
    forbid: ["core/domains/database/client.ts"],
    names: ["createDrizzle"],
    because:
      "Only the composition root (core/domains/runtime) opens the database. Take the runtime as a parameter.",
  },
  {
    name: "composition-root-repositories",
    importers: ["**"],
    except: compositionRoot,
    forbid: ["core/domains/database/repositories/*-repository.ts"],
    allow: "import-type",
    because:
      "Only the composition root (core/domains/runtime) constructs repositories. Take the runtime as a parameter and import the type only.",
  },
  {
    name: "composition-root-stores",
    importers: ["**"],
    except: compositionRoot,
    forbid: ["unstorage"],
    names: ["createStorage"],
    because: "Only the composition root opens a store. Take the runtime as a parameter.",
  },
  {
    name: "composition-root-cache-storage",
    importers: ["**"],
    except: compositionRoot,
    forbid: ["core/domains/media-store/cache-storage.ts"],
    names: ["createFileCacheStorage"],
    because:
      "Only the composition root (core/domains/runtime) opens the stores. Take the runtime as a parameter.",
  },
  {
    // The helpers of a repository are named `<repository>.<aspect>.ts` next to it. They take the
    // database or a transaction handle.
    name: "private-repository-helpers",
    importers: ["**"],
    except: ["core/domains/database/repositories/story-repository.ts"],
    forbid: ["core/domains/database/repositories/story-repository.*.ts"],
    because:
      "story-repository.<aspect>.ts holds helpers private to story-repository.ts. Call the repository method instead of importing the helper.",
  },
  {
    name: "scripts-never-migrate",
    importers: ["scripts/**"],
    forbid: ["core/domains/database/migrate*", "drizzle-orm/**/migrator"],
    because:
      "Scripts require an initialized database. Run migrations at server startup in nitro/plugins/database.ts.",
  },
];
