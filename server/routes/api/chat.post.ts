import process from "node:process";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  toUIMessageStream,
  validateUIMessages,
} from "ai";
import { createOllama } from "ai-sdk-ollama";
import { defineEventHandler } from "nitro/h3";
import { z } from "zod";
import { findRecentUserSummary, listAccounts } from "@@/core/assistant/recent-user-summary.ts";
import { getUserSummaryModel } from "@@/core/accounts/user-summary.ts";
import { getProductionRuntime } from "@@/core/runtime/production-runtime.ts";
import type { Runtime } from "@@/core/runtime/runtime.ts";

const CHAT_SYSTEM_PROMPT = [
  "Tu es l'assistant de Slopstagram, un fil de stories Instagram. Tu ne connais aucun compte par toi-même : tu ne peux répondre qu'avec les outils.",
  "Règles :",
  "1. Si l'utilisateur demande la liste des comptes, appelle d'abord l'outil listUsers. L'interface affiche déjà la liste : réponds par une seule phrase courte qui donne le nombre de comptes, sans les recopier.",
  "2. Si l'utilisateur mentionne un compte avec @nom, appelle d'abord l'outil getRecentUserSummary avec le nom sans le @, puis reformule le résumé reçu.",
  "3. N'invente jamais de compte ni de résumé. Si l'outil ne renvoie pas de résumé ou répond compte inconnu, dis-le simplement.",
  "4. Réponds en français, en 2 ou 3 phrases, une fois l'outil appelé.",
].join("\n");

const ChatRequestSchema = z.object({ messages: z.array(z.unknown()) });

type ChatRuntime = Pick<Runtime, "fetchOllama" | "stories" | "summaries" | "users" | "vision">;

export async function createChatResponse(
  runtime: ChatRuntime,
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  const parsed = ChatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new globalThis.Response("invalid chat request", { status: 400 });
  }
  const messages = await validateUIMessages({ messages: parsed.data.messages });
  const ollama = createOllama({
    baseURL: process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434",
    fetch: runtime.fetchOllama,
  });

  const tools = {
    listUsers: tool({
      description: "Liste les comptes Instagram enregistrés.",
      inputSchema: z.object({}),
      execute: () => listAccounts(runtime),
    }),
    getRecentUserSummary: tool({
      description:
        "Donne le résumé des stories publiées par un compte dans les dernières 24 heures, comme sur la page du fil.",
      inputSchema: z.object({ username: z.string().describe("Le nom du compte, sans le @.") }),
      execute: ({ username }) =>
        findRecentUserSummary(runtime, username, now) ?? { error: "compte inconnu" },
    }),
  };

  const result = streamText({
    // Reasoning is what lets a small model decide to call the tools.
    model: ollama(process.env.OLLAMA_CHAT_MODEL ?? getUserSummaryModel(), { think: true }),
    instructions: CHAT_SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(4),
    tools,
  });
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream, tools }),
  });
}

export default defineEventHandler(
  async (event) => await createChatResponse(getProductionRuntime(), event.req),
);
