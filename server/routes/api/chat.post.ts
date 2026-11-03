import process from "node:process";
import {
  chat,
  chatParamsFromRequest,
  maxIterations,
  toolDefinition,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { OllamaTextAdapter } from "@tanstack/ai-ollama";
import { defineEventHandler } from "nitro/h3";
import { z } from "zod";
import { findRecentUserSummary, listAccounts } from "@@/core/assistant/recent-user-summary.ts";
import { getUserSummaryModel } from "@@/core/accounts/user-summary.ts";
import { getProductionRuntime } from "@@/core/runtime/production-runtime.ts";
import type { Runtime } from "@@/core/runtime/runtime.ts";
import { getOllamaClient } from "@@/core/vision/ollama.ts";

const CHAT_SYSTEM_PROMPT = [
  "Tu es l'assistant de Slopstagram, un fil de stories Instagram. Tu ne connais aucun compte par toi-même : tu ne peux répondre qu'avec les outils.",
  "Règles :",
  "1. Si l'utilisateur demande la liste des comptes, appelle d'abord l'outil listUsers. L'interface affiche déjà la liste : réponds par une seule phrase courte qui donne le nombre de comptes, sans les recopier.",
  "2. Si l'utilisateur mentionne un compte avec @nom, appelle d'abord l'outil getRecentUserSummary avec le nom sans le @, puis reformule le résumé reçu.",
  "3. N'invente jamais de compte ni de résumé. Si l'outil ne renvoie pas de résumé ou répond compte inconnu, dis-le simplement.",
  "4. Réponds en français, en 2 ou 3 phrases, une fois l'outil appelé.",
].join("\n");

type ChatRuntime = Pick<Runtime, "fetchOllama" | "stories" | "summaries" | "users" | "vision">;

export async function createChatResponse(
  runtime: ChatRuntime,
  request: Request,
  now: Date = new Date(),
): Promise<Response> {
  let params: Awaited<ReturnType<typeof chatParamsFromRequest>>;
  try {
    params = await chatParamsFromRequest(request);
  } catch (error) {
    if (error instanceof globalThis.Response) {
      return error;
    }
    throw error;
  }

  const tools = [
    toolDefinition({
      name: "listUsers",
      description: "Liste les comptes Instagram enregistrés.",
      inputSchema: z.object({}),
    }).server(() => listAccounts(runtime)),
    toolDefinition({
      name: "getRecentUserSummary",
      description:
        "Donne le résumé des stories publiées par un compte dans les dernières 24 heures, comme sur la page du fil.",
      inputSchema: z.object({ username: z.string().describe("Le nom du compte, sans le @.") }),
    }).server(
      ({ username }) =>
        findRecentUserSummary(runtime, username, now) ?? { error: "compte inconnu" },
    ),
  ];

  const client = getOllamaClient({ fetch: runtime.fetchOllama, host: process.env.OLLAMA_HOST });
  const stream = chat({
    adapter: new OllamaTextAdapter(client, process.env.OLLAMA_CHAT_MODEL ?? getUserSummaryModel()),
    agentLoopStrategy: maxIterations(4),
    messages: params.messages,
    // Reasoning is what lets a small model decide to call the tools.
    reasoning: "high",
    runId: params.runId,
    systemPrompts: [CHAT_SYSTEM_PROMPT],
    threadId: params.threadId,
    tools,
  });
  return toServerSentEventsResponse(stream);
}

export default defineEventHandler(
  async (event) => await createChatResponse(getProductionRuntime(), event.req),
);
