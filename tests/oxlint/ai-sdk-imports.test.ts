import { describe, it } from "vitest";
import { RuleTester } from "oxlint/plugins-dev";
import aiSdkImports from "../../oxlint/plugins/rules/ai-sdk-imports.ts";

// The tester registers its cases through vitest's suite functions.
RuleTester.describe = (text, fn) => {
  describe(text, fn);
};
RuleTester.it = (text, fn) => {
  it(text, fn);
};

new RuleTester().run("ai-sdk-imports", aiSdkImports, {
  valid: [
    {
      name: "an Assistant tool module builds its tool with the AI SDK",
      code: 'import { tool } from "ai";',
      filename: "/repo/core/domains/story-feed/get-feed-user-summaries.tool.ts",
    },
    {
      name: "the Assistant domain streams with the AI SDK and its Ollama provider",
      code: 'import { streamText } from "ai";\nimport { createOllama } from "ai-sdk-ollama";',
      filename: "/repo/core/domains/assistant/assistant.ts",
    },
    {
      name: "the chat page's hook talks to the chat route",
      code: 'import { useChat } from "@ai-sdk/react";\nimport { DefaultChatTransport } from "ai";',
      filename: "/repo/app/hooks/use-assistant-chat.ts",
    },
    {
      name: "the evals judge the Assistant with an AI SDK provider",
      code: 'import { generateText } from "ai";\nimport { codexCli } from "ai-sdk-provider-codex-cli";',
      filename: "/repo/evals/assistant-judge.ts",
    },
    {
      name: "a domain module imports other packages",
      code: 'import { z } from "zod";\nimport { airport } from "aircraft";',
      filename: "/repo/core/domains/story-feed/feed-user-summary.ts",
    },
  ],
  invalid: [
    {
      name: "a domain module outside a tool module",
      code: 'import { tool } from "ai";',
      filename: "/repo/core/domains/story-feed/feed-user-summary.ts",
      errors: [{ messageId: "restricted", data: { source: "ai" } }],
    },
    {
      name: "a type-only import in a component",
      code: 'import type { UIMessage } from "ai";',
      filename: "/repo/app/components/chat-panel.tsx",
      errors: [{ messageId: "restricted", data: { source: "ai" } }],
    },
    {
      name: "the chat route goes through the Assistant domain",
      code: 'import { streamText } from "ai";',
      filename: "/repo/app/routes/api/chat.ts",
      errors: [{ messageId: "restricted", data: { source: "ai" } }],
    },
    {
      name: "a community provider outside the Assistant domain",
      code: 'import { codexCli } from "ai-sdk-provider-codex-cli";',
      filename: "/repo/core/domains/vision/ollama.ts",
      errors: [{ messageId: "restricted", data: { source: "ai-sdk-provider-codex-cli" } }],
    },
    {
      name: "a provider or an AI SDK subpath outside the Assistant domain",
      code: 'import { createOllama } from "ai-sdk-ollama";\nexport { useChat } from "@ai-sdk/react";',
      filename: "/repo/core/domains/vision/ollama.ts",
      errors: [
        { messageId: "restricted", data: { source: "ai-sdk-ollama" } },
        { messageId: "restricted", data: { source: "@ai-sdk/react" } },
      ],
    },
  ],
});
