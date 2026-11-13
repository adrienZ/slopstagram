import type { ToolSet } from "ai";
import { createListAccountsTool } from "@@/core/domains/accounts/list-accounts.tool.ts";
import { createSearchAccountsTool } from "@@/core/domains/accounts/search-accounts.tool.ts";
import { createGetTaggedPlaceTool } from "@@/core/domains/places/get-tagged-place.tool.ts";
import { createListTaggedPlacesTool } from "@@/core/domains/places/list-tagged-places.tool.ts";
import { createSearchTaggedPlacesTool } from "@@/core/domains/places/search-tagged-places.tool.ts";
import { createGetFeedUserSummariesTool } from "@@/core/domains/story-feed/get-feed-user-summaries.tool.ts";

// A tool module missing from the registry fails `knip --production` as an unused file.
const assistantTools = {
  getFeedUserSummaries: createGetFeedUserSummariesTool,
  getTaggedPlace: createGetTaggedPlaceTool,
  listAccounts: createListAccountsTool,
  listTaggedPlaces: createListTaggedPlacesTool,
  searchAccounts: createSearchAccountsTool,
  searchTaggedPlaces: createSearchTaggedPlacesTool,
};

type AssistantToolRegistry = typeof assistantTools;

type AssistantToolName = keyof AssistantToolRegistry;

type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
  value: infer Intersection,
) => void
  ? Intersection
  : never;

/** What every Assistant tool reads, together. */
export type AssistantToolsRuntime = UnionToIntersection<
  Parameters<AssistantToolRegistry[AssistantToolName]>[0]
>;

export type AssistantTools = {
  [Name in AssistantToolName]: ReturnType<AssistantToolRegistry[Name]>;
};

export function createAssistantTools(runtime: AssistantToolsRuntime): ToolSet {
  return Object.fromEntries(
    Object.entries(assistantTools).map(([name, create]) => [name, create(runtime)]),
  );
}
