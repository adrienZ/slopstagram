import { describe, it } from "vitest";
import { RuleTester } from "oxlint/plugins-dev";
import assistantClientSeam from "../../oxlint/plugins/rules/assistant-client-seam.ts";

// The tester registers its cases through vitest's suite functions.
RuleTester.describe = (text, fn) => {
  describe(text, fn);
};
RuleTester.it = (text, fn) => {
  it(text, fn);
};

new RuleTester().run("assistant-client-seam", assistantClientSeam, {
  valid: [
    {
      name: "a component reads the chat message type",
      code: 'import type { AssistantUIMessage } from "@@/core/domains/assistant/assistant.ts";',
      filename: "/repo/app/components/chat-panel.tsx",
    },
    {
      name: "a client helper reads the tool names as inline type specifiers",
      code: 'import { type AssistantToolName } from "@@/core/domains/assistant/assistant-tools.ts";',
      filename: "/repo/app/utils/place-mentions.ts",
    },
    {
      name: "the chat route streams the Assistant's reply on the server",
      code: 'import { streamAssistantReply } from "@@/core/domains/assistant/assistant.ts";',
      filename: "/repo/app/routes/api/chat.ts",
    },
    {
      name: "the Assistant domain composes the tool modules",
      code: 'import { createListAccountsTool } from "@@/core/domains/accounts/list-accounts.tool.ts";',
      filename: "/repo/core/domains/assistant/assistant-tools.ts",
    },
    {
      name: "a component imports another domain module",
      code: 'import { formatDate } from "@@/core/domains/places/tagged-place-rules.ts";',
      filename: "/repo/app/components/place-explorer.tsx",
    },
  ],
  invalid: [
    {
      name: "a component imports the Assistant module as a value",
      code: 'import { streamAssistantReply } from "@@/core/domains/assistant/assistant.ts";',
      filename: "/repo/app/components/chat-panel.tsx",
      errors: [{ messageId: "assistantValue" }],
    },
    {
      name: "a client helper mixes a value with a type from the Assistant module",
      code: 'import { assistantTools, type AssistantToolName } from "@@/core/domains/assistant/assistant-tools.ts";',
      filename: "/repo/app/utils/place-mentions.ts",
      errors: [{ messageId: "assistantValue" }],
    },
    {
      name: "a component re-exports the Assistant module",
      code: 'export { assistantTools } from "@@/core/domains/assistant/assistant-tools.ts";',
      filename: "/repo/app/components/chat-views.tsx",
      errors: [{ messageId: "assistantValue" }],
    },
    {
      name: "a component reaches the Assistant module by a relative path",
      code: 'import { assistantTools } from "../../core/domains/assistant/assistant-tools.ts";',
      filename: "/repo/app/components/chat-panel.tsx",
      errors: [{ messageId: "assistantValue" }],
    },
    {
      name: "a component imports a tool module as a type",
      code: 'import type { AccountList } from "@@/core/domains/accounts/list-accounts.tool.ts";',
      filename: "/repo/app/components/accounts-list.tsx",
      errors: [{ messageId: "toolModule" }],
    },
    {
      name: "a server route imports a tool module instead of the Assistant module",
      code: 'import { createListAccountsTool } from "@@/core/domains/accounts/list-accounts.tool.ts";',
      filename: "/repo/app/routes/api/chat.ts",
      errors: [{ messageId: "toolModule" }],
    },
  ],
});
