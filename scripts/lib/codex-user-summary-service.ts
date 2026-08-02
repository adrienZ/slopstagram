import { createHash } from "node:crypto";
import { cwd } from "node:process";
import { Codex } from "@openai/codex-sdk";
import {
  codexUserSummaryStorage,
  getCodexUserSummaryCacheKey,
} from "./cache-service.ts";
import { noopLogger, type Logger } from "./logging-service.ts";
import { getReportUserKey } from "./report-user-key-service.ts";
import type {
  CodexUserSummaryStorage,
  StoriesManifestReport,
  StoryOutputUser,
} from "./types.ts";

export const CODEX_USER_SUMMARY_PROMPT =
  "Résume cet utilisateur Instagram en 2 ou 3 phrases en français.";
export const CODEX_USER_SUMMARY_UNAVAILABLE = "résumé indisponible";

const USER_SUMMARY_OUTPUT_SCHEMA = {
  additionalProperties: false,
  properties: {
    summary: {
      type: "string",
    },
  },
  required: ["summary"],
  type: "object",
} as const;

type RunCodexUserSummary = (
  prompt: string,
  outputSchema: unknown,
) => Promise<string>;

export type ResolveCodexUserSummariesOptions = {
  logger?: Logger;
  ollamaVisionByPreviewUrl?: Map<string, string>;
  runCodexUserSummary?: RunCodexUserSummary;
  storage?: CodexUserSummaryStorage;
  workingDirectory?: string;
};

function getSourceHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeSummary(value: string): string {
  return value.normalize("NFC").replaceAll(/\s+/g, " ").trim();
}

function parseSummaryResponse(value: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return CODEX_USER_SUMMARY_UNAVAILABLE;
  }

  try {
    const payload = JSON.parse(trimmedValue) as { summary?: unknown };
    if (typeof payload.summary === "string") {
      return normalizeSummary(payload.summary);
    }
  } catch {
    // Codex may still return plain text if structured output is unavailable.
  }

  return normalizeSummary(trimmedValue);
}

function createPrompt(
  user: StoryOutputUser,
  ollamaVisionByPreviewUrl: Map<string, string> | undefined,
): string {
  const stories = user.stories.map((story) => ({
    apple_caption: story.apple_caption,
    ig_caption: story.ig_caption,
    media_pk: story.media_pk,
    ollama_vision: story.preview_image_url
      ? ollamaVisionByPreviewUrl?.get(story.preview_image_url) ?? ""
      : "",
    stickers: story.stickers,
    status: story.status,
  }));

  return [
    CODEX_USER_SUMMARY_PROMPT,
    "",
    "Utilise uniquement les données ci-dessous. Concentre-toi sur les activités visibles, les lieux, les événements, les thèmes et le texte lisible. N'évoque pas les légendes manquantes ni les champs techniques. Réponds en français. Retourne du JSON avec un seul champ string nommé summary.",
    "",
    JSON.stringify(
      {
        full_name: user.full_name,
        stories,
        username: user.username,
      },
      null,
      2,
    ),
  ].join("\n");
}

function createDefaultCodexRunner(workingDirectory: string): RunCodexUserSummary {
  const codex = new Codex();

  return async (prompt, outputSchema) => {
    const thread = codex.startThread({
      approvalPolicy: "never",
      sandboxMode: "read-only",
      skipGitRepoCheck: true,
      webSearchMode: "disabled",
      workingDirectory,
    });
    const turn = await thread.run(prompt, { outputSchema });

    return turn.finalResponse;
  };
}

export async function resolveCodexUserSummariesForReport(
  report: StoriesManifestReport,
  options: ResolveCodexUserSummariesOptions = {},
): Promise<Map<string, string>> {
  const logger = options.logger ?? noopLogger;
  const ollamaVisionByPreviewUrl = options.ollamaVisionByPreviewUrl;
  const runCodexUserSummary =
    options.runCodexUserSummary ??
    createDefaultCodexRunner(options.workingDirectory ?? cwd());
  const storage = options.storage ?? codexUserSummaryStorage;
  const summaryByUserKey = new Map<string, string>();

  for (const [index, user] of report.output.users.entries()) {
    const userKey = getReportUserKey(user, index);
    const prompt = createPrompt(user, ollamaVisionByPreviewUrl);
    const sourceHash = getSourceHash({ prompt, userKey });
    const cacheKey = getCodexUserSummaryCacheKey(sourceHash);
    const cachedEntry = await storage.getItem(cacheKey);

    if (
      cachedEntry &&
      cachedEntry.source_hash === sourceHash &&
      cachedEntry.prompt === CODEX_USER_SUMMARY_PROMPT &&
      cachedEntry.user_key === userKey
    ) {
      summaryByUserKey.set(userKey, cachedEntry.result);
      continue;
    }

    try {
      const response = await runCodexUserSummary(prompt, USER_SUMMARY_OUTPUT_SCHEMA);
      const result = parseSummaryResponse(response);

      await storage.setItem(cacheKey, {
        prompt: CODEX_USER_SUMMARY_PROMPT,
        result,
        source_hash: sourceHash,
        user_key: userKey,
      });
      summaryByUserKey.set(userKey, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`could not summarize user ${userKey} with Codex: ${message}`);
      summaryByUserKey.set(userKey, CODEX_USER_SUMMARY_UNAVAILABLE);
    }
  }

  return summaryByUserKey;
}
