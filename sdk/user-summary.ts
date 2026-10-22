import { createHash } from "node:crypto";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import type { Fetch as OllamaFetch } from "ollama";
import { z } from "zod";
import { getOllamaClient } from "./ollama.ts";
import {
  userSummaryRepository,
  type UserSummaryRepository,
} from "./repositories/user-summary-repository.ts";
import type { Logger } from "./lib/logging-service.ts";
import { getReportUserKey } from "./lib/report-user-key-service.ts";
import type { StoriesManifestReport, StoryOutputUser, VisionResult } from "./lib/types.ts";

type HttpFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const USER_SUMMARY_MLX_MODEL = "qwen3.5:0.8b-mlx";
const USER_SUMMARY_PORTABLE_MODEL = "qwen3.5:0.8b";

function getUserSummaryModel(
  platform: NodeJS.Platform = process.platform,
  architecture: string = process.arch,
): string {
  return platform === "darwin" && architecture === "arm64"
    ? USER_SUMMARY_MLX_MODEL
    : USER_SUMMARY_PORTABLE_MODEL;
}

const USER_SUMMARY_PROMPT = "Résume cet utilisateur Instagram en 2 ou 3 phrases en français.";
const USER_SUMMARY_UNAVAILABLE = "résumé indisponible";
const USER_SUMMARY_TIMEOUT_MS = 60_000;

const UserSummaryResponseSchema = z
  .object({
    summary: z.string(),
  })
  .strict();
const USER_SUMMARY_OUTPUT_SCHEMA = z.toJSONSchema(UserSummaryResponseSchema);

type RunUserSummary = (prompt: string) => Promise<string>;

interface ResolveUserSummariesOptions {
  endpoint?: string;
  fetchOllama?: HttpFetch;
  logger: Logger;
  model?: string;
  visionByPreviewUrl?: Map<string, VisionResult>;
  runUserSummary?: RunUserSummary;
  repository?: Pick<UserSummaryRepository, "findBySourceHash" | "save">;
  timeoutMs?: number;
}

function getUserSummarySourceHash(value: {
  model: string;
  prompt: string;
  userKey: string;
}): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function getUserSummaryPromptHash(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

function normalizeSummary(value: string): string {
  return value.normalize("NFC").replaceAll(/\s+/gu, " ").trim();
}

function isUsableSummary(value: string | null | undefined): value is string {
  return (
    value !== null &&
    value !== undefined &&
    value.trim().length > 0 &&
    normalizeSummary(value) !== USER_SUMMARY_UNAVAILABLE
  );
}

function parseSummaryResponse(value: string): string | null {
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
): Array<string> {
  const details: Array<string> = [];

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

function createFallbackSummary(
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

function createSummaryPrompt(
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

function createTimeoutFetch(fetchOllama: HttpFetch, timeoutMs: number): OllamaFetch {
  async function timeoutFetch(input: RequestInfo | URL, init?: RequestInit) {
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
  }

  return timeoutFetch;
}

function createDefaultOllamaRunner(options: {
  endpoint?: string;
  fetchOllama?: HttpFetch;
  model: string;
  timeoutMs: number;
}): RunUserSummary {
  const ollama = getOllamaClient({
    fetch: createTimeoutFetch(options.fetchOllama ?? globalThis.fetch, options.timeoutMs),
    host: options.endpoint,
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

interface ResolvedUserSummaryOptions {
  logger: NonNullable<ResolveUserSummariesOptions["logger"]>;
  model: string;
  runUserSummary: RunUserSummary;
  repository: Pick<UserSummaryRepository, "findBySourceHash" | "save">;
  visionByPreviewUrl?: Map<string, VisionResult>;
}

const USER_SUMMARY_PROMPT_HASH = getUserSummaryPromptHash(USER_SUMMARY_PROMPT);

interface ReadUserSummariesOptions {
  model?: string;
  repository?: Pick<UserSummaryRepository, "findBySourceHash">;
  visionByPreviewUrl?: Map<string, VisionResult>;
}

function createUserSummarySource(
  user: StoryOutputUser,
  options: { model: string; visionByPreviewUrl?: Map<string, VisionResult> },
) {
  const userKey = getReportUserKey(user);
  const prompt = createSummaryPrompt(user, options.visionByPreviewUrl);
  const sourceHash = getUserSummarySourceHash({ model: options.model, prompt, userKey });

  return { prompt, sourceHash, userKey };
}

function resolveOptions(options: ResolveUserSummariesOptions): ResolvedUserSummaryOptions {
  const model = options.model ?? getUserSummaryModel();
  const timeoutMs = options.timeoutMs ?? USER_SUMMARY_TIMEOUT_MS;

  return {
    logger: options.logger,
    model,
    runUserSummary:
      options.runUserSummary ??
      createDefaultOllamaRunner({
        endpoint: options.endpoint,
        fetchOllama: options.fetchOllama,
        model,
        timeoutMs,
      }),
    repository: options.repository ?? userSummaryRepository,
    visionByPreviewUrl: options.visionByPreviewUrl,
  };
}

function getStoredSummary(options: {
  sourceHash: string;
  userKey: string;
  repository: Pick<UserSummaryRepository, "findBySourceHash">;
}): string | null {
  const entry = options.repository.findBySourceHash(options.sourceHash);

  if (
    entry?.source_hash === options.sourceHash &&
    entry.prompt_hash === USER_SUMMARY_PROMPT_HASH &&
    entry.user_key === options.userKey
  ) {
    return isUsableSummary(entry.result) ? normalizeSummary(entry.result) : null;
  }

  return null;
}

export function readUserSummaries(
  users: Array<StoryOutputUser>,
  options: ReadUserSummariesOptions = {},
): Map<string, string> {
  const repository = options.repository ?? userSummaryRepository;
  const model = options.model ?? getUserSummaryModel();
  const summaries = new Map<string, string>();

  for (const user of users) {
    const source = createUserSummarySource(user, {
      model,
      visionByPreviewUrl: options.visionByPreviewUrl,
    });
    const summary = getStoredSummary({ ...source, repository });

    if (summary !== null) {
      summaries.set(source.userKey, summary);
    }
  }

  return summaries;
}

async function runSummaryForUser(
  user: StoryOutputUser,
  source: ReturnType<typeof createUserSummarySource>,
  resolved: ResolvedUserSummaryOptions,
): Promise<string> {
  const response = await resolved.runUserSummary(source.prompt);
  const result = parseSummaryResponse(response);

  if (result === null || result.length === 0) {
    resolved.logger.warn(
      `user summary returned empty response for ${source.userKey}; using report fallback`,
    );
    return createFallbackSummary(user, resolved.visionByPreviewUrl);
  }

  await resolved.repository.save({
    prompt_hash: USER_SUMMARY_PROMPT_HASH,
    result,
    source_hash: source.sourceHash,
    user_key: source.userKey,
  });
  return result;
}

async function resolveUserSummary(
  user: StoryOutputUser,
  current: number,
  total: number,
  resolved: ResolvedUserSummaryOptions,
): Promise<[string, string]> {
  const source = createUserSummarySource(user, resolved);
  const { userKey } = source;
  const storedSummary = getStoredSummary({ ...source, repository: resolved.repository });

  if (storedSummary !== null) {
    resolved.logger.progress(current, total, {
      prefix: "user-summary",
      suffix: `repository hit ${userKey}`,
    });
    return [userKey, storedSummary];
  }

  try {
    resolved.logger.progress(current, total, {
      prefix: "user-summary",
      suffix: `summarizing ${userKey}`,
    });
    const summary = await runSummaryForUser(user, source, resolved);
    resolved.logger.progress(current, total, {
      prefix: "user-summary",
      suffix: `summarized ${userKey}`,
    });
    return [userKey, summary];
  } catch (error) {
    const statusError = z.object({ status_code: z.number() }).safeParse(error);
    const status = statusError.success ? statusError.data.status_code : null;
    const message = error instanceof Error ? error.message : "unknown request error";
    resolved.logger.warn(
      `could not summarize user ${userKey} with Ollama${
        status === null ? "" : ` HTTP ${status}`
      }: ${message}`,
    );
    return [userKey, USER_SUMMARY_UNAVAILABLE];
  }
}

export async function resolveUserSummariesForReport(
  report: Pick<StoriesManifestReport, "output">,
  options: ResolveUserSummariesOptions,
): Promise<Map<string, string>> {
  const resolved = resolveOptions(options);
  const summaryByUserKey = new Map<string, string>();

  for (const [index, user] of report.output.users.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- User summaries run serially to bound local model resource use and preserve progress.
    const [userKey, summary] = await resolveUserSummary(
      user,
      index + 1,
      report.output.users.length,
      resolved,
    );
    summaryByUserKey.set(userKey, summary);
  }

  return summaryByUserKey;
}
