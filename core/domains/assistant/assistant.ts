import process from "node:process";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type InferUITools,
  type LanguageModel,
  type UIDataTypes,
  type UIMessage,
  type UIMessageStreamOptions,
} from "ai";
import { createOllama } from "ai-sdk-ollama";
import type { JsonValue } from "@@/core/utils/json-value.ts";
import type { AccountsRuntime } from "@@/core/domains/accounts/accounts.ts";
import { createListAccountsTool } from "@@/core/domains/accounts/list-accounts.tool.ts";
import { createSearchAccountsTool } from "@@/core/domains/accounts/search-accounts.tool.ts";
import { getUserSummaryModel } from "@@/core/domains/accounts/user-summary.ts";
import { createGetTaggedPlaceTool } from "@@/core/domains/places/get-tagged-place.tool.ts";
import { createListTaggedPlacesTool } from "@@/core/domains/places/list-tagged-places.tool.ts";
import { createSearchTaggedPlacesTool } from "@@/core/domains/places/search-tagged-places.tool.ts";
import type { TaggedPlacesRuntime } from "@@/core/domains/places/tagged-places.ts";
import { createGetMentionConnectionTool } from "@@/core/domains/mention-connections/get-mention-connection.tool.ts";
import { createSearchMentionConnectionsTool } from "@@/core/domains/mention-connections/search-mention-connections.tool.ts";
import { createListMentionConnectionsTool } from "@@/core/domains/mention-connections/list-mention-connections.tool.ts";
import type { MentionConnectionsRuntime } from "@@/core/domains/mention-connections/mention-connections.ts";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import type { FeedUserSummaryRuntime } from "@@/core/domains/story-feed/feed-user-summary.ts";
import { createGetFeedUserSummariesTool } from "@@/core/domains/story-feed/get-feed-user-summaries.tool.ts";
import { getOllamaHost } from "@@/core/domains/vision/ollama.ts";

const ASSISTANT_INSTRUCTIONS = `You are Slopstagram's Assistant. Answer briefly in the user's language, only from tool results. Never invent facts or ids.

Mention connections (stickers in saved stories, ALL history, including unknown accounts):
- Two people ("se connaissent ?", who mentioned whom) → ALWAYS call getMentionConnection with both usernames or names. Never answer without it.
- One named person → ALWAYS call searchMentionConnections with that name. If several distinct candidates come back, ask which one is meant.
- No named person → listMentionConnections.
- Call the tool BEFORE writing any answer. Then follow the result's interpretation: a mention is not proof that people know each other, and no mention is not proof they do not. Give the observed stories (storyId, date) and who mentioned whom (evidence.author → evidence.target). Never invent a story URL.
- Recent posts in the last 24 hours: call getFeedUserSummaries with the usernames. For a name without a username, searchAccounts first; clarify multiple matches.
- Which accounts are saved: listAccounts. Finding an account by name: searchAccounts.
- Places: listTaggedPlaces lists them, searchTaggedPlaces finds names/addresses/categories, getTaggedPlace reads a result id. Write places as [name](place:id).
- For any paginated result with nextOffset, say more results exist and offer the next page. Report unknown/missing outcomes plainly.
- Greetings, thanks or unrelated questions: answer briefly without tools.`;

/**
 * The tools after which the model only has to write the answer. A place search is a lookup: the
 * model reasons after it to decide whether to read the place it found with getTaggedPlace.
 */
const answerTools = new Set([
  "getFeedUserSummaries",
  "getTaggedPlace",
  "getMentionConnection",
  "listMentionConnections",
  "listAccounts",
  "listTaggedPlaces",
]);

/** Bounds one reply: a tool call, its result, then the answer, with room for one retry. */
const MAX_STEPS = 4;

type AssistantToolsRuntime = FeedUserSummaryRuntime &
  AccountsRuntime &
  TaggedPlacesRuntime &
  MentionConnectionsRuntime;

/** The chat model, as the AI SDK takes it once it is built (not a model id). */
export type AssistantModel = Exclude<LanguageModel, string>;

export type AssistantRuntime = AssistantToolsRuntime &
  Pick<Runtime, "fetchOllama" | "logger"> & {
    /** Wraps the chat model: the evals use it to trace its calls. Production leaves it unset. */
    wrapModel?: (model: AssistantModel) => AssistantModel;
  };

function createAssistantTools(runtime: AssistantToolsRuntime) {
  return {
    getFeedUserSummaries: createGetFeedUserSummariesTool(runtime),
    getTaggedPlace: createGetTaggedPlaceTool(runtime),
    getMentionConnection: createGetMentionConnectionTool(runtime),
    listMentionConnections: createListMentionConnectionsTool(runtime),
    searchMentionConnections: createSearchMentionConnectionsTool(runtime),
    listAccounts: createListAccountsTool(runtime),
    listTaggedPlaces: createListTaggedPlacesTool(runtime),
    searchAccounts: createSearchAccountsTool(runtime),
    searchTaggedPlaces: createSearchTaggedPlacesTool(runtime),
  };
}

export type AssistantUIMessage = UIMessage<
  unknown,
  UIDataTypes,
  InferUITools<ReturnType<typeof createAssistantTools>>
>;

/** The chat model, from `OLLAMA_CHAT_MODEL`, defaulting to the user summary model. */
function getAssistantModel(): string {
  return process.env.OLLAMA_CHAT_MODEL ?? getUserSummaryModel();
}

/** The UI messages of a chat request, or null when they are not a valid conversation. */
export async function validateAssistantMessages(
  runtime: AssistantToolsRuntime,
  messages: Array<JsonValue>,
): Promise<Array<AssistantUIMessage> | null> {
  if (messages.length === 0) {
    return null;
  }
  const validated = await safeValidateUIMessages<AssistantUIMessage>({
    messages,
    tools: createAssistantTools(runtime),
  });
  return validated.success ? validated.data : null;
}

/** Logs why the chat model did not answer, and gives the error text the chat shows. */
function createFailureDescriber(
  logger: AssistantRuntime["logger"],
): NonNullable<UIMessageStreamOptions<AssistantUIMessage>["onError"]> {
  return (error) => {
    logger.warn(
      `the chat model did not answer: ${error instanceof Error ? error.message : String(error)}`,
    );
    return "The chat model did not answer.";
  };
}

/** Streams the Assistant's reply to a conversation, as a UI message stream response. */
export async function streamAssistantReply(
  runtime: AssistantRuntime,
  messages: Array<AssistantUIMessage>,
): Promise<Response> {
  const ollama = createOllama({ baseURL: getOllamaHost(), fetch: runtime.fetchOllama });
  const tools = createAssistantTools(runtime);
  function chatModel(think: boolean): AssistantModel {
    const model = ollama(getAssistantModel(), { think });
    return runtime.wrapModel?.(model) ?? model;
  }
  const result = streamText({
    // Reasoning is what lets a small model decide to call the tools.
    model: chatModel(true),
    prepareStep: ({ steps }) => {
      const lastTools = steps.at(-1)?.toolCalls.map(({ toolName }) => toolName) ?? [];
      // After a read tool only the answer is left. With reasoning on, a small model often writes
      // that answer inside its reasoning and sends no text, so the reply looks empty.
      return lastTools.some((toolName) => answerTools.has(toolName))
        ? { model: chatModel(false) }
        : undefined;
    },
    instructions: ASSISTANT_INSTRUCTIONS,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(MAX_STEPS),
    tools,
  });
  const describeFailure = createFailureDescriber(runtime.logger);
  return createUIMessageStreamResponse({
    // The merged stream turns a model stream that breaks mid-answer, such as Ollama ending
    // with an error line on a malformed tool call, into the same error part.
    stream: createUIMessageStream<AssistantUIMessage>({
      execute: ({ writer }) => {
        writer.merge(
          toUIMessageStream<typeof tools, AssistantUIMessage>({
            stream: result.stream,
            tools,
            originalMessages: messages,
            onError: describeFailure,
          }),
        );
      },
      onError: describeFailure,
    }),
  });
}
