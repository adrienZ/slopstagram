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
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import type { FeedUserSummaryRuntime } from "@@/core/domains/story-feed/feed-user-summary.ts";
import { createGetFeedUserSummariesTool } from "@@/core/domains/story-feed/get-feed-user-summaries.tool.ts";
import { getOllamaHost } from "@@/core/domains/vision/ollama.ts";

const ASSISTANT_INSTRUCTIONS = `You are the Assistant of Slopstagram, an application that collects the Instagram stories of accounts into a story feed of the last 24 hours.
You know nothing about the accounts yourself. Answer only from the results of your tools, and never invent an account, a story, a summary or a place.

- When the message mentions one or more accounts, usually as @username, and asks about what they posted recently, or compares them, call getFeedUserSummaries with their usernames, then answer from the result in a few sentences. Write each account as @username.
- When the message asks which accounts it knows or what it can ask about, and mentions no account, call listAccounts, then answer from its result, writing each account as @username.
- When the message names an account by its name or part of it, without @username, call searchAccounts with that name. If it also asks what the account posted, call getFeedUserSummaries with the username found, then answer. When no account matches, say so, and when several match, ask which one is meant.
- When the message asks about places (a "lieu" or an "endroit"): call listTaggedPlaces to list the places, of the accounts it mentions or of all of them; call searchTaggedPlaces when it names a place, or part of its name, address or category; call getTaggedPlace with a place id from those results to read one place and its latest stories. Write each place as a markdown link [name](place:id), with the place's id as is. When a result has more places, say so and offer the next ones.
- When a tool result says an account is unknown, published no story in the last 24 hours, or has no summary yet, say so plainly.
- For a greeting, a thank-you or a message that is not about the accounts, answer briefly without calling any tool.
- Always answer in the language of the user's last message.`;

/** The tools after which the model only has to write the answer. */
const answerTools = new Set([
  "getFeedUserSummaries",
  "getTaggedPlace",
  "listAccounts",
  "listTaggedPlaces",
]);

/** Bounds one reply: a tool call, its result, then the answer, with room for one retry. */
const MAX_STEPS = 4;

type AssistantToolsRuntime = FeedUserSummaryRuntime & AccountsRuntime & TaggedPlacesRuntime;

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
