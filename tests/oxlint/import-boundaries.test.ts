import { describe, it } from "vitest";
import { RuleTester } from "oxlint/plugins-dev";
import importBoundaries from "../../oxlint/plugins/rules/import-boundaries.ts";

// The tester registers its cases through vitest's suite functions.
RuleTester.describe = (text, fn) => {
  describe(text, fn);
};
RuleTester.it = (text, fn) => {
  it(text, fn);
};

new RuleTester({ cwd: "/repo" }).run("import-boundaries", importBoundaries, {
  valid: [
    {
      name: "a component reads the chat message type",
      code: 'import type { AssistantUIMessage } from "@@/core/domains/assistant/assistant.ts";',
      filename: "/repo/app/components/chat-panel.tsx",
    },
    {
      name: "a component re-exports every type of the Assistant module",
      code: 'export type * from "@@/core/domains/assistant/assistant.ts";',
      filename: "/repo/app/components/chat-views.tsx",
    },
    {
      name: "the chat route streams the Assistant's reply on the server",
      code: 'import { streamAssistantReply } from "@@/core/domains/assistant/assistant.ts";',
      filename: "/repo/app/routes/api/chat.ts",
    },
    {
      name: "the Assistant domain composes the tool modules with the AI SDK",
      code: 'import { streamText } from "ai";\nimport { createListAccountsTool } from "../accounts/list-accounts.tool.ts";',
      filename: "/repo/core/domains/assistant/assistant-tools.ts",
    },
    {
      name: "a tool module builds its tool with the AI SDK",
      code: 'import { tool } from "ai";',
      filename: "/repo/core/domains/story-feed/get-feed-user-summaries.tool.ts",
    },
    {
      name: "the chat page's hook talks to the chat route",
      code: 'import { useChat } from "@ai-sdk/react";\nimport { DefaultChatTransport } from "ai";',
      filename: "/repo/app/hooks/use-assistant-chat.ts",
    },
    {
      name: "the evals judge the Assistant with an AI SDK provider",
      code: 'import { codexCli } from "ai-sdk-provider-codex-cli";',
      filename: "/repo/evals/assistant-judge.ts",
    },
    {
      name: "a domain module imports packages that only look like the AI SDK",
      code: 'import { airport } from "aircraft";\nimport { x } from "ai-tools";',
      filename: "/repo/core/domains/story-feed/feed-user-summary.ts",
    },
    {
      name: "a component reads a repository's row type",
      code: 'import type { Story } from "@@/core/domains/database/repositories/story-repository.ts";',
      filename: "/repo/app/components/story-card.tsx",
    },
    {
      name: "a domain module imports a database helper other than createDrizzle",
      code: 'import { inTransaction } from "../database/client.ts";',
      filename: "/repo/core/domains/places/places.ts",
    },
    {
      name: "the composition root builds the repositories and opens the database",
      code: 'import { DatabaseSync } from "node:sqlite";\nimport { StoryRepository } from "../database/repositories/story-repository.ts";',
      filename: "/repo/core/domains/runtime/runtime.ts",
    },
    {
      name: "the story repository calls its helpers",
      code: 'import { saveMusic } from "./story-repository.music-metadata.ts";',
      filename: "/repo/core/domains/database/repositories/story-repository.ts",
    },
  ],
  invalid: [
    {
      name: "a component imports the Assistant module as a value",
      code: 'import { streamAssistantReply } from "@@/core/domains/assistant/assistant.ts";',
      filename: "/repo/app/components/chat-panel.tsx",
      errors: [{ messageId: "assistant-client-seam" }],
    },
    {
      name: "a client helper reads the tool names as inline type specifiers, which still load the module",
      code: 'import { type AssistantToolName } from "@/../core/domains/assistant/assistant-tools.ts";',
      filename: "/repo/app/utils/place-mentions.ts",
      errors: [{ messageId: "assistant-client-seam" }],
    },
    {
      name: "a component re-exports a type as an inline specifier, which still loads the module",
      code: 'export { type AssistantUIMessage } from "@@/core/domains/assistant/assistant.ts";',
      filename: "/repo/app/components/chat-views.tsx",
      errors: [{ messageId: "assistant-client-seam" }],
    },
    {
      name: "a component reaches the Assistant module by a relative path",
      code: 'import { assistantTools } from "../../core/domains/assistant/assistant-tools.ts";',
      filename: "/repo/app/components/chat-panel.tsx",
      errors: [{ messageId: "assistant-client-seam" }],
    },
    {
      name: "a component loads the Assistant module lazily",
      code: 'const assistant = await import("@@/core/domains/assistant/assistant.ts");',
      filename: "/repo/app/components/chat-panel.tsx",
      errors: [{ messageId: "assistant-client-seam" }],
    },
    {
      name: "the chat route imports a tool module as a type",
      code: 'import type { AccountList } from "@@/core/domains/accounts/list-accounts.tool.ts";',
      filename: "/repo/app/routes/api/chat.ts",
      errors: [{ messageId: "assistant-tool-modules" }],
    },
    {
      name: "a type-only AI SDK import in a component",
      code: 'import type { UIMessage } from "ai";',
      filename: "/repo/app/components/chat-panel.tsx",
      errors: [{ messageId: "ai-sdk" }],
    },
    {
      name: "a provider and an AI SDK subpath outside the Assistant domain",
      code: 'import { createOllama } from "ai-sdk-ollama";\nexport { useChat } from "@ai-sdk/react";',
      filename: "/repo/core/domains/vision/ollama.ts",
      errors: [{ messageId: "ai-sdk" }, { messageId: "ai-sdk" }],
    },
    {
      name: "a page imports a repository",
      code: 'import { StoryRepository } from "@@/core/domains/database/repositories/story-repository.ts";',
      filename: "/repo/app/routes/stories.tsx",
      errors: [
        { messageId: "loader-only-database" },
        { messageId: "composition-root-repositories" },
      ],
    },
    {
      name: "a domain module opens the database",
      code: 'import { createDrizzle, inTransaction } from "../database/client.ts";\nimport { DatabaseSync } from "node:sqlite";',
      filename: "/repo/core/domains/places/places.ts",
      errors: [
        { messageId: "composition-root-drizzle" },
        { messageId: "composition-root-database" },
      ],
    },
    {
      name: "a domain module opens a store through a namespace import",
      code: 'import * as unstorage from "unstorage";',
      filename: "/repo/core/domains/music/music-cache.ts",
      errors: [{ messageId: "composition-root-stores" }],
    },
    {
      name: "another repository calls a story repository helper",
      code: 'import { saveMusic } from "./story-repository.music-metadata.ts";',
      filename: "/repo/core/domains/database/repositories/report-repository.ts",
      errors: [{ messageId: "private-repository-helpers" }],
    },
    {
      name: "a script runs the migrations",
      code: 'import { migrate } from "drizzle-orm/node-sqlite/migrator";',
      filename: "/repo/scripts/backfill.ts",
      errors: [{ messageId: "scripts-never-migrate" }],
    },
  ],
});
