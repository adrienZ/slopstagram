import type { ToolSet } from "ai";
import { createListAccountsTool } from "@@/core/domains/accounts/list-accounts.tool.ts";
import { createSearchAccountsTool } from "@@/core/domains/accounts/search-accounts.tool.ts";
import { createGetTaggedPlaceTool } from "@@/core/domains/places/get-tagged-place.tool.ts";
import { createListTaggedPlacesTool } from "@@/core/domains/places/list-tagged-places.tool.ts";
import { createSearchTaggedPlacesTool } from "@@/core/domains/places/search-tagged-places.tool.ts";
import { createGetFeedUserSummariesTool } from "@@/core/domains/story-feed/get-feed-user-summaries.tool.ts";

/*
 * The Assistant tool registry: the only list of the Assistant tools, each created from the runtime
 * narrowed to what it reads. Each one lives in the domain whose data it reads, in a module named
 * after its key (`listAccounts` in `list-accounts.tool.ts`). `knip --production` reports a tool
 * module missing from here as an unused file.
 */

/**
 * After a read tool only the answer is left: the model writes it without reasoning, since with
 * reasoning on a small model often writes the answer inside its reasoning and sends no text.
 */
const readTools = {
  getFeedUserSummaries: createGetFeedUserSummariesTool,
  getTaggedPlace: createGetTaggedPlaceTool,
  listAccounts: createListAccountsTool,
  listTaggedPlaces: createListTaggedPlacesTool,
};

/**
 * A lookup tool searches: the model keeps reasoning after its result, to decide whether to read
 * the account or the place it found.
 */
const lookupTools = {
  searchAccounts: createSearchAccountsTool,
  searchTaggedPlaces: createSearchTaggedPlacesTool,
};

const assistantTools = { ...readTools, ...lookupTools };

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

/** The Assistant tools by name, each with its own input and output types. */
export type AssistantTools = {
  [Name in AssistantToolName]: ReturnType<AssistantToolRegistry[Name]>;
};

/** Every Assistant tool, by name, as the model is offered them. */
export function createAssistantTools(runtime: AssistantToolsRuntime): ToolSet {
  return Object.fromEntries(
    Object.entries(assistantTools).map(([name, create]) => [name, create(runtime)]),
  );
}

/**
 * Whether the model writes the answer without reasoning in the step after these tool calls: when
 * any of them is a read tool. A lookup or an unknown tool keeps reasoning.
 */
export function writesAnswerAfter(toolNames: Array<string>): boolean {
  return toolNames.some((name) => Object.hasOwn(readTools, name));
}
