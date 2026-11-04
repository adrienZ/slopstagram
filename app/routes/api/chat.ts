import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  streamAssistantReply,
  validateAssistantMessages,
  type AssistantRuntime,
} from "@@/core/domains/assistant/assistant.ts";
import { getProductionRuntime } from "@@/core/domains/runtime/production-runtime.ts";
import { JsonValueSchema } from "@@/core/utils/json-value.ts";

const ChatRequestSchema = z.object({ messages: z.array(JsonValueSchema) });

async function readChatRequest(request: Request) {
  try {
    return ChatRequestSchema.safeParse(await request.json()).data ?? null;
  } catch {
    // A body that is not JSON is an invalid chat request.
    return null;
  }
}

/** Answers a POSTed conversation of UI messages with the Assistant's UI message stream. */
export async function handleChatRequest(
  runtime: AssistantRuntime,
  request: Request,
): Promise<Response> {
  const body = await readChatRequest(request);
  const messages = body === null ? null : await validateAssistantMessages(runtime, body.messages);
  if (messages === null) {
    return new globalThis.Response("Invalid chat request", { status: 400 });
  }
  return await streamAssistantReply(runtime, messages);
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => await handleChatRequest(getProductionRuntime(), request),
    },
  },
});
