import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import { RuleTester } from "oxlint/plugins-dev";
import assistantToolRegistry from "../../oxlint/plugins/rules/assistant-tool-registry.ts";

// The tester registers its cases through vitest's suite functions.
RuleTester.describe = (text, fn) => {
  describe(text, fn);
};
RuleTester.it = (text, fn) => {
  it(text, fn);
};

// Domains holding two Assistant tool modules, and the registry beside them.
const domains = mkdtempSync(path.join(tmpdir(), "assistant-tool-registry-"));
mkdirSync(path.join(domains, "accounts"));
mkdirSync(path.join(domains, "assistant"));
writeFileSync(path.join(domains, "accounts", "list-accounts.tool.ts"), "");
writeFileSync(path.join(domains, "accounts", "search-accounts.tool.ts"), "");
const registry = path.join(domains, "assistant", "assistant-tools.ts");

const listAccounts =
  'import { createListAccountsTool } from "@@/core/domains/accounts/list-accounts.tool.ts";\n';
const searchAccounts =
  'import { createSearchAccountsTool } from "@@/core/domains/accounts/search-accounts.tool.ts";\n';

new RuleTester().run("assistant-tool-registry", assistantToolRegistry, {
  valid: [
    {
      name: "every tool module, each tool named after its module",
      code: `${listAccounts}${searchAccounts}const tools = { listAccounts: createListAccountsTool, searchAccounts: createSearchAccountsTool };`,
      filename: registry,
    },
    {
      name: "a property whose value is not imported from a tool module",
      code: `${listAccounts}${searchAccounts}import { createStore } from "./store.ts";\nconst tools = { anything: createStore };`,
      filename: registry,
    },
  ],
  invalid: [
    {
      name: "a tool module missing from the registry",
      code: `${listAccounts}const tools = { listAccounts: createListAccountsTool };`,
      filename: registry,
      errors: [{ messageId: "missing", data: { module: "accounts/search-accounts.tool.ts" } }],
    },
    {
      name: "a tool named after another module",
      code: `${listAccounts}${searchAccounts}const tools = { searchAccounts: createListAccountsTool };`,
      filename: registry,
      errors: [
        {
          messageId: "mismatch",
          data: {
            toolName: "searchAccounts",
            expected: "search-accounts.tool.ts",
            actual: "list-accounts.tool.ts",
          },
        },
      ],
    },
    {
      name: "a tool whose name differs from its module only by case",
      code: `${listAccounts}${searchAccounts}const tools = { listaccounts: createListAccountsTool };`,
      filename: registry,
      errors: [
        {
          messageId: "mismatch",
          data: {
            toolName: "listaccounts",
            expected: "listaccounts.tool.ts",
            actual: "list-accounts.tool.ts",
          },
        },
      ],
    },
    {
      name: "a capitalised tool name",
      code: `${listAccounts}${searchAccounts}const tools = { ListAccounts: createListAccountsTool };`,
      filename: registry,
      errors: [
        {
          messageId: "mismatch",
          data: {
            toolName: "ListAccounts",
            expected: "-list-accounts.tool.ts",
            actual: "list-accounts.tool.ts",
          },
        },
      ],
    },
  ],
});
