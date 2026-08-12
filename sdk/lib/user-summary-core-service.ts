import { createHash } from "node:crypto";
import { clearTimeout, setTimeout } from "node:timers";
import { Ollama, type Fetch as OllamaFetch } from "ollama";
import { z } from "zod";
import type { Logger } from "./logging-service.ts";
import type { UserSummaryStorage, VisionResult, StoryOutputUser } from "./types.ts";

export const USER_SUMMARY_MODEL = "qwen3.5:0.8b-mlx";
export const USER_SUMMARY_PROMPT =
  "Résume cet utilisateur Instagram en 2 ou 3 phrases en français.";
export const USER_SUMMARY_UNAVAILABLE = "résumé indisponible";
export const USER_SUMMARY_TIMEOUT_MS = 60_000;

const UserSummaryResponseSchema = z
  .object({
    summary: z.string(),
  })
  .strict();
const USER_SUMMARY_OUTPUT_SCHEMA = z.toJSONSchema(UserSummaryResponseSchema);

export type RunUserSummary = (prompt: string) => Promise<string>;

export type ResolveUserSummariesOptions = {
  endpoint?: string;
  fetchOllama?: OllamaFetch;
  logger: Logger;
  model?: string;
  visionByPreviewUrl?: Map<string, VisionResult>;
  runUserSummary?: RunUserSummary;
  storage?: UserSummaryStorage;
  timeoutMs?: number;
};

export function getUserSummarySourceHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeSummary(value: string): string {
  return value.normalize("NFC").replaceAll(/\s+/gu, " ").trim();
}

export function isUsableSummary(value: string | null | undefined): value is string {
  return (
    value !== null &&
    value !== undefined &&
    value.trim().length > 0 &&
    normalizeSummary(value) !== USER_SUMMARY_UNAVAILABLE
  );
}

export function parseSummaryResponse(value: string): string | null {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  try {
    const payload = UserSummaryResponseSchema.parse(JSON.parse(trimmedValue));
    const summary = normalizeSummary(payload.summary);

    return isUsableSummary(summary) ? summary : null;
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
    const vision =
      story.preview_image_url !== null && story.preview_image_url.length > 0
        ? visionByPreviewUrl?.get(story.preview_image_url)
        : undefined;
    const values = [vision?.visual ?? "", story.stickers.join(", "), story.locations.join(", ")];

    for (const value of values) {
      const normalizedValue = normalizeSummary(value);

      if (
        normalizedValue &&
        !details.some((detail) => detail.toLowerCase() === normalizedValue.toLowerCase())
      ) {
        details.push(normalizedValue);
      }
    }
  }

  return details.slice(0, 4);
}

export function createFallbackSummary(
  user: StoryOutputUser,
  visionByPreviewUrl: Map<string, VisionResult> | undefined,
): string {
  const fullName = user.full_name?.trim() ?? "";
  const username = user.username.trim();
  const displayName = fullName.length > 0 ? fullName : username || "Cet utilisateur";
  const details = collectFallbackDetails(user, visionByPreviewUrl);

  if (details.length === 0) {
    return USER_SUMMARY_UNAVAILABLE;
  }

  return normalizeSummary(
    `${displayName} a partagé ${user.stories.length} ${
      user.stories.length > 1 ? "stories" : "story"
    }. Éléments visibles: ${details.join("; ")}.`,
  );
}

export function createSummaryPrompt(
  user: StoryOutputUser,
  visionByPreviewUrl: Map<string, VisionResult> | undefined,
): string {
  const stories = user.stories.map((story) => {
    const vision =
      story.preview_image_url !== null && story.preview_image_url.length > 0
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
    USER_SUMMARY_PROMPT,
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

export function getHttpStatus(error: unknown): number | null {
  if (
    error !== null &&
    error !== undefined &&
    typeof error === "object" &&
    "status_code" in error &&
    typeof error.status_code === "number"
  ) {
    return error.status_code;
  }

  return null;
}

function resolveOllamaHost(endpoint: string | undefined): string {
  return (endpoint ?? "http://127.0.0.1:11434").replace(/\/api\/generate\/?$/u, "");
}

function createTimeoutFetch(fetchOllama: OllamaFetch, timeoutMs: number): OllamaFetch {
  return async (input, init) => {
    const controller = new globalThis.AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

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

export function createDefaultOllamaRunner(options: {
  endpoint?: string;
  fetchOllama?: OllamaFetch;
  model: string;
  timeoutMs: number;
}): RunUserSummary {
  const ollama = new Ollama({
    fetch: createTimeoutFetch(options.fetchOllama ?? globalThis.fetch, options.timeoutMs),
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
