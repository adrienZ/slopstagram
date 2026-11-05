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
  type UIDataTypes,
  type UIMessage,
  type UIMessageStreamOptions,
} from "ai";
import { createOllama } from "ai-sdk-ollama";
import type { JsonValue } from "@@/core/utils/json-value.ts";
import { getUserSummaryModel } from "@@/core/domains/accounts/user-summary.ts";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import type { FeedUserSummaryRuntime } from "@@/core/domains/story-feed/feed-user-summary.ts";
import { createGetFeedUserSummariesTool } from "@@/core/domains/story-feed/feed-user-summary.tool.ts";
import { getOllamaHost } from "@@/core/domains/vision/ollama.ts";

const ASSISTANT_INSTRUCTIONS = `You are the Assistant of Slopstagram, an application that collects the Instagram stories of saved accounts into a story feed of the last 24 hours.
You know nothing about the accounts yourself. Answer only from the results of your tools, and never invent an account, a story or a summary.

- When the message mentions one or more accounts, usually as @username, and asks about what they posted recently, or compares them, call getFeedUserSummaries with their usernames, then answer from the result in a few sentences. Write each account as @username.
- When a tool result says an account is unknown, published no story in the last 24 hours, or has no summary yet, say so plainly.
- For a greeting or a message that is not about the accounts, answer briefly without calling any tool.
- Always answer in the language of the user's last message.`;

/** Bounds one reply: a tool call, its result, then the answer, with room for one retry. */
const MAX_STEPS = 4;

export type AssistantRuntime = FeedUserSummaryRuntime & Pick<Runtime, "fetchOllama" | "logger">;

function createAssistantTools(runtime: FeedUserSummaryRuntime) {
  return { getFeedUserSummaries: createGetFeedUserSummariesTool(runtime) };
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
  runtime: FeedUserSummaryRuntime,
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
  const result = streamText({
    // Reasoning is what lets a small model decide to call the tools.
    model: ollama(getAssistantModel(), { think: true }),
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
