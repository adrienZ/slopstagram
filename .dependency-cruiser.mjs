// Who may import what, on resolved paths. Name-level bans (createDrizzle, createStorage,
// createFileCacheStorage, React effects) stay in oxlint's no-restricted-imports: dependency-cruiser
// sees modules, not the names taken from them.

// The composition root, and what it builds from; tests build their own repositories, databases and stores.
const compositionRoot =
  "^(core/domains/runtime/|core/domains/database/|core/domains/media-store/cache-storage\\.ts$|tests/)";

// Under verbatimModuleSyntax only `import type` and `export type` declarations are erased.
const valueImport = { dependencyTypesNot: ["type-only"] };

/** @type {import("dependency-cruiser").IConfiguration} */
export default {
  forbidden: [
    {
      name: "assistant-client-seam",
      comment:
        "Only server routes (app/routes/api) may import values from core/domains/assistant: use `import type`. See docs/adr/0007-assistant-tools-live-in-their-domain.md.",
      severity: "error",
      from: { path: "^app/", pathNot: "^app/routes/api/" },
      to: { path: "^core/domains/assistant/", ...valueImport },
    },
    {
      name: "assistant-tool-modules",
      comment:
        "The app never imports an Assistant tool module (*.tool.ts): go through core/domains/assistant. See docs/adr/0007-assistant-tools-live-in-their-domain.md.",
      severity: "error",
      from: { path: "^app/" },
      to: { path: "\\.tool\\.ts$" },
    },
    {
      name: "ai-sdk",
      comment:
        "Only Assistant tool modules (*.tool.ts), core/domains/assistant, app/hooks/use-assistant-chat.ts, tests and evals may import the AI SDK. See docs/adr/0007-assistant-tools-live-in-their-domain.md.",
      severity: "error",
      from: {
        pathNot:
          "(\\.tool\\.ts$|^core/domains/assistant/|^app/hooks/use-assistant-chat\\.ts$|^tests/|^evals/)",
      },
      to: { path: "^node_modules/(ai|@ai-sdk/[^/]+|ai-sdk-ollama|ai-sdk-provider-[^/]+)/" },
    },
    {
      name: "loader-only-database",
      comment:
        "Pages and components get their data from a loader. Import types only, not repositories or the database client.",
      severity: "error",
      from: { path: "^app/(routes|components|hooks|utils)/" },
      to: { path: "^core/domains/database/(repositories/)?[^/]+$", ...valueImport },
    },
    {
      name: "composition-root-database",
      comment: "Only the composition root opens the database. Take the runtime as a parameter.",
      severity: "error",
      from: { pathNot: compositionRoot },
      to: { path: "^(node:)?sqlite$" },
    },
    {
      name: "composition-root-repositories",
      comment:
        "Only the composition root (core/domains/runtime) constructs repositories. Take the runtime as a parameter and import the type only.",
      severity: "error",
      from: { pathNot: compositionRoot },
      to: { path: "^core/domains/database/repositories/[^/]+-repository\\.ts$", ...valueImport },
    },
    {
      name: "private-repository-helpers",
      comment:
        "story-repository.<aspect>.ts holds helpers private to story-repository.ts. Call the repository method instead of importing the helper.",
      severity: "error",
      from: { pathNot: "^core/domains/database/repositories/story-repository\\.ts$" },
      to: { path: "^core/domains/database/repositories/story-repository\\.[^/]+\\.ts$" },
    },
    {
      name: "scripts-never-migrate",
      comment:
        "Scripts require an initialized database. Run migrations at server startup in nitro/plugins/database.ts.",
      severity: "error",
      from: { path: "^scripts/" },
      to: { path: "(^core/domains/database/migrate|^node_modules/drizzle-orm/.+/migrator)" },
    },
  ],
  options: {
    // The project is on TypeScript 7, which dependency-cruiser cannot load yet.
    parser: "swc",
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^(app/shadcn/|app/routeTree\\.gen\\.ts$)" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".mjs"],
    },
  },
};
