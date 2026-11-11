import type { Tool, ToolSet } from "ai";
import { createListAccountsTool } from "@@/core/domains/accounts/list-accounts.tool.ts";
import { createSearchAccountsTool } from "@@/core/domains/accounts/search-accounts.tool.ts";
import { createGetTaggedPlaceTool } from "@@/core/domains/places/get-tagged-place.tool.ts";
import { createListTaggedPlacesTool } from "@@/core/domains/places/list-tagged-places.tool.ts";
import { createSearchTaggedPlacesTool } from "@@/core/domains/places/search-tagged-places.tool.ts";
import { createGetFeedUserSummariesTool } from "@@/core/domains/story-feed/get-feed-user-summaries.tool.ts";

/**
 * What the model does in the step after a tool's result. After a read only the answer is left:
 * the model writes it without reasoning, since with reasoning on a small model often writes the
 * answer inside its reasoning and sends no text. A search is a lookup: the model keeps reasoning,
 * to decide whether to read the account or the place it found.
 */
type AfterResult = "write-answer" | "keep-reasoning";

interface AssistantToolEntry {
  /** Creates the tool from the runtime narrowed to what the tool reads. */
  create: (runtime: never) => Tool;
  afterResult: AfterResult;
}

/** The Assistant tools: the only list of them. Each one lives in the domain whose data it reads. */
export const assistantTools = {
  getFeedUserSummaries: { create: createGetFeedUserSummariesTool, afterResult: "write-answer" },
  getTaggedPlace: { create: createGetTaggedPlaceTool, afterResult: "write-answer" },
  listAccounts: { create: createListAccountsTool, afterResult: "write-answer" },
  listTaggedPlaces: { create: createListTaggedPlacesTool, afterResult: "write-answer" },
  searchAccounts: { create: createSearchAccountsTool, afterResult: "keep-reasoning" },
  searchTaggedPlaces: { create: createSearchTaggedPlacesTool, afterResult: "keep-reasoning" },
} satisfies Record<string, AssistantToolEntry>;

type AssistantToolRegistry = typeof assistantTools;

export type AssistantToolName = keyof AssistantToolRegistry;

type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
  value: infer Intersection,
) => void
  ? Intersection
  : never;

/** What every Assistant tool reads, together. */
export type AssistantToolsRuntime = UnionToIntersection<
  Parameters<AssistantToolRegistry[AssistantToolName]["create"]>[0]
>;

/** The Assistant tools by name, each with its own input and output types. */
export type AssistantTools = {
  [Name in AssistantToolName]: ReturnType<AssistantToolRegistry[Name]["create"]>;
};

/** Every Assistant tool, by name, as the model is offered them. */
export function createAssistantTools(runtime: AssistantToolsRuntime): ToolSet {
  return Object.fromEntries(
    Object.entries(assistantTools).map(([name, entry]) => [name, entry.create(runtime)]),
  );
}

function isAssistantToolName(name: string): name is AssistantToolName {
  return Object.hasOwn(assistantTools, name);
}

/**
 * Whether the model writes the answer without reasoning in the step after these tool calls: when
 * any of them is a tool after which only the answer is left. An unknown tool keeps reasoning.
 */
export function writesAnswerAfter(toolNames: Array<string>): boolean {
  return toolNames.some(
    (name) => isAssistantToolName(name) && assistantTools[name].afterResult === "write-answer",
  );
}
