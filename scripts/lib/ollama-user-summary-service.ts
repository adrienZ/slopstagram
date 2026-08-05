import { createHash } from "node:crypto";
import { Ollama, type Fetch as OllamaFetch } from "ollama";
import {
  getOllamaUserSummaryCacheKey,
  ollamaUserSummaryStorage,
} from "./cache-service.ts";
import { noopLogger, type Logger } from "./logging-service.ts";
import { getReportUserKey } from "./report-user-key-service.ts";
import type {
  OllamaUserSummaryStorage,
  VisionResult,
  StoriesManifestReport,
  StoryOutputUser,
} from "./types.ts";

export const OLLAMA_USER_SUMMARY_MODEL = "qwen3.5:0.8b-mlx";
export const OLLAMA_USER_SUMMARY_PROMPT =
  "Résume cet utilisateur Instagram en 2 ou 3 phrases en français.";
export const OLLAMA_USER_SUMMARY_UNAVAILABLE = "résumé indisponible";
export const OLLAMA_USER_SUMMARY_TIMEOUT_MS = 60_000;

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

type RunOllamaUserSummary = (prompt: string) => Promise<string>;

export type ResolveOllamaUserSummariesOptions = {
  endpoint?: string;
  fetchOllama?: OllamaFetch;
  logger?: Logger;
  model?: string;
  visionByPreviewUrl?: Map<string, VisionResult>;
  runOllamaUserSummary?: RunOllamaUserSummary;
  storage?: OllamaUserSummaryStorage;
  timeoutMs?: number;
};

export function getOllamaUserSummarySourceHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeSummary(value: string): string {
  return value.normalize("NFC").replaceAll(/\s+/g, " ").trim();
}

function isUsableSummary(value: string | null | undefined): value is string {
  return Boolean(
    value &&
      value.trim() &&
      normalizeSummary(value) !== OLLAMA_USER_SUMMARY_UNAVAILABLE,
  );
}

function parseSummaryResponse(value: string): string | null {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  try {
    const payload = JSON.parse(trimmedValue) as { summary?: unknown };
    if (typeof payload.summary === "string") {
      const summary = normalizeSummary(payload.summary);

      return isUsableSummary(summary) ? summary : null;
    }
  } catch {
    // Ollama may still return plain text if structured output is unavailable.
  }

  const summary = normalizeSummary(trimmedValue);

  return isUsableSummary(summary) ? summary : null;
}

function collectFallbackDetails(
  user: StoryOutputUser,
  visionByPreviewUrl: Map<string, VisionResult> | undefined,
): string[] {
  const details: string[] = [];

  for (const story of user.stories) {
    const vision = story.preview_image_url
      ? visionByPreviewUrl?.get(story.preview_image_url)
      : undefined;
    const values = [
      vision?.visual ?? "",
      story.stickers.join(", "),
      story.locations.join(", "),
    ];

    for (const value of values) {
      const normalizedValue = normalizeSummary(value);

      if (
        normalizedValue &&
        !details.some(
          (detail) => detail.toLowerCase() === normalizedValue.toLowerCase(),
        )
      ) {
        details.push(normalizedValue);
      }
    }
  }

  return details.slice(0, 4);
}

function createFallbackSummary(
  user: StoryOutputUser,
  visionByPreviewUrl: Map<string, VisionResult> | undefined,
): string {
  const displayName =
    user.full_name?.trim() || user.username?.trim() || "Cet utilisateur";
  const details = collectFallbackDetails(user, visionByPreviewUrl);

  if (details.length === 0) {
    return OLLAMA_USER_SUMMARY_UNAVAILABLE;
  }

  return normalizeSummary(
    `${displayName} a partagé ${user.stories.length} ${
      user.stories.length > 1 ? "stories" : "story"
    }. Éléments visibles: ${details.join("; ")}.`,
  );
}

export function createOllamaUserSummaryPrompt(
  user: StoryOutputUser,
  visionByPreviewUrl: Map<string, VisionResult> | undefined,
): string {
  const stories = user.stories.map((story) => {
    const vision = story.preview_image_url
      ? visionByPreviewUrl?.get(story.preview_image_url)
      : undefined;

    return {
      locations: story.locations,
      media_pk: story.media_pk,
      stickers: story.stickers,
      vision_description: vision?.visual ?? "",
    };
  });

  return [
    OLLAMA_USER_SUMMARY_PROMPT,
    "",
    "Utilise uniquement les données ci-dessous. Concentre-toi sur les activités visibles, les lieux, les événements et les thèmes. N'évoque pas les légendes manquantes ni les champs techniques. Réponds en français. Retourne du JSON avec un seul champ string nommé summary.",
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

function getOllamaHttpStatus(error: unknown): number | null {
  if (
    error &&
    typeof error === "object" &&
    "status_code" in error &&
    typeof error.status_code === "number"
  ) {
    return error.status_code;
  }

  return null;
}

function resolveOllamaHost(endpoint: string | undefined): string {
  return (endpoint ?? "http://127.0.0.1:11434").replace(/\/api\/generate\/?$/, "");
}

function createTimeoutFetch(
  fetchOllama: OllamaFetch,
  timeoutMs: number,
): OllamaFetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetchOllama(input, {
        ...init,
        signal: init?.signal ?? controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

function createDefaultOllamaRunner(options: {
  endpoint?: string;
  fetchOllama?: OllamaFetch;
  model: string;
  timeoutMs: number;
}): RunOllamaUserSummary {
  const ollama = new Ollama({
    fetch: createTimeoutFetch(options.fetchOllama ?? fetch, options.timeoutMs),
    host: resolveOllamaHost(options.endpoint),
  });

  return async (prompt) => {
    const response = await ollama.generate({
      format: USER_SUMMARY_OUTPUT_SCHEMA,
      model: options.model,
      options: {
        num_predict: 300,
        temperature: 0.2,
      },
      prompt,
      stream: false,
      think: false,
    });

    return response.response;
  };
}

export async function resolveOllamaUserSummariesForReport(
  report: StoriesManifestReport,
  options: ResolveOllamaUserSummariesOptions = {},
): Promise<Map<string, string>> {
  const logger = options.logger ?? noopLogger;
  const model = options.model ?? OLLAMA_USER_SUMMARY_MODEL;
  const visionByPreviewUrl = options.visionByPreviewUrl;
  const timeoutMs = options.timeoutMs ?? OLLAMA_USER_SUMMARY_TIMEOUT_MS;
  const runOllamaUserSummary =
    options.runOllamaUserSummary ??
    createDefaultOllamaRunner({
      endpoint: options.endpoint,
      fetchOllama: options.fetchOllama,
      model,
      timeoutMs,
    });
  const storage = options.storage ?? ollamaUserSummaryStorage;
  const summaryByUserKey = new Map<string, string>();
  const users = report.output.users;

  for (const [index, user] of users.entries()) {
    const userKey = getReportUserKey(user, index);
    logger.progress("ollama summary", index + 1, users.length);
    const prompt = createOllamaUserSummaryPrompt(user, visionByPreviewUrl);
    const sourceHash = getOllamaUserSummarySourceHash({ model, prompt, userKey });
    const cacheKey = getOllamaUserSummaryCacheKey(sourceHash);
    const cachedEntry = await storage.getItem(cacheKey);

    if (
      cachedEntry &&
      cachedEntry.source_hash === sourceHash &&
      cachedEntry.prompt === OLLAMA_USER_SUMMARY_PROMPT &&
      cachedEntry.user_key === userKey
    ) {
      if (isUsableSummary(cachedEntry.result)) {
        logger.info(`ollama summary cache hit for ${userKey}`);
        summaryByUserKey.set(userKey, cachedEntry.result);
        continue;
      }

      logger.warn(`ollama summary ignored bad cached result for ${userKey}`);
    }

    try {
      logger.info(`ollama summary started for ${userKey}`);
      const response = await runOllamaUserSummary(prompt);
      const result = parseSummaryResponse(response);

      if (!result) {
        const fallbackSummary = createFallbackSummary(user, visionByPreviewUrl);
        logger.warn(
          `ollama summary returned empty response for ${userKey}; using report fallback`,
        );
        summaryByUserKey.set(userKey, fallbackSummary);
        continue;
      }

      await storage.setItem(cacheKey, {
        prompt: OLLAMA_USER_SUMMARY_PROMPT,
        result,
        source_hash: sourceHash,
        user_key: userKey,
      });
      summaryByUserKey.set(userKey, result);
      logger.info(`ollama summary completed for ${userKey}`);
    } catch (error) {
      const status = getOllamaHttpStatus(error);
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(
        `could not summarize user ${userKey} with Ollama${
          status === null ? "" : ` HTTP ${status}`
        }: ${message}`,
      );
      summaryByUserKey.set(userKey, OLLAMA_USER_SUMMARY_UNAVAILABLE);
    }
  }

  return summaryByUserKey;
}
