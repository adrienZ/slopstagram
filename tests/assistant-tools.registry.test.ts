import { globSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { assistantTools } from "@@/core/domains/assistant/assistant-tools.ts";

/** `list-accounts.tool.ts` names the tool `listAccounts`. */
function toolName(file: string): string {
  return path
    .basename(file, ".tool.ts")
    .replaceAll(/-(?<letter>[a-z])/gu, (_, letter: string) => letter.toUpperCase());
}

test("every Assistant tool module in the domains is in the registry", () => {
  const toolModules = globSync("core/domains/**/*.tool.ts").map(toolName);

  expect(toolModules.length).toBeGreaterThan(0);
  expect(Object.keys(assistantTools).toSorted()).toStrictEqual(toolModules.toSorted());
});
