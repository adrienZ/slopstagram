import { getUserSummaryCacheKey, userSummaryStorage } from "./cache-service.ts";
import { getReportUserKey } from "./report-user-key-service.ts";
import type { StoriesManifestReport, StoryOutputUser, VisionResult } from "./types.ts";
import {
  createDefaultOllamaRunner,
  createFallbackSummary,
  createSummaryPrompt,
  getHttpStatus,
  getUserSummarySourceHash,
  isUsableSummary,
  parseSummaryResponse,
  USER_SUMMARY_MODEL,
  USER_SUMMARY_PROMPT,
  USER_SUMMARY_TIMEOUT_MS,
  USER_SUMMARY_UNAVAILABLE,
  type ResolveUserSummariesOptions,
  type RunUserSummary,
} from "./user-summary-core-service.ts";

type ResolvedUserSummaryOptions = {
  logger: NonNullable<ResolveUserSummariesOptions["logger"]>;
  model: string;
  runUserSummary: RunUserSummary;
  storage: NonNullable<ResolveUserSummariesOptions["storage"]>;
  visionByPreviewUrl?: Map<string, VisionResult>;
};

function resolveOptions(options: ResolveUserSummariesOptions): ResolvedUserSummaryOptions {
  const model = options.model ?? USER_SUMMARY_MODEL;
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
    storage: options.storage ?? userSummaryStorage,
    visionByPreviewUrl: options.visionByPreviewUrl,
  };
}

async function getCachedSummary(options: {
  cacheKey: string;
  sourceHash: string;
  userKey: string;
  resolved: ResolvedUserSummaryOptions;
}): Promise<string | null> {
  const cachedEntry = await options.resolved.storage.getItem(options.cacheKey);

  if (
    cachedEntry?.source_hash === options.sourceHash &&
    cachedEntry.prompt === USER_SUMMARY_PROMPT &&
    cachedEntry.user_key === options.userKey
  ) {
    return isUsableSummary(cachedEntry.result) ? cachedEntry.result : null;
  }

  return null;
}

async function runSummaryForUser(
  user: StoryOutputUser,
  userKey: string,
  cacheKey: string,
  sourceHash: string,
  resolved: ResolvedUserSummaryOptions,
): Promise<string> {
  const prompt = createSummaryPrompt(user, resolved.visionByPreviewUrl);
  const response = await resolved.runUserSummary(prompt);
  const result = parseSummaryResponse(response);

  if (result === null || result.length === 0) {
    resolved.logger.warn(
      `user summary returned empty response for ${userKey}; using report fallback`,
    );
    return createFallbackSummary(user, resolved.visionByPreviewUrl);
  }

  await resolved.storage.setItem(cacheKey, {
    prompt: USER_SUMMARY_PROMPT,
    result,
    source_hash: sourceHash,
    user_key: userKey,
  });
  return result;
}

async function resolveUserSummary(
  user: StoryOutputUser,
  current: number,
  total: number,
  resolved: ResolvedUserSummaryOptions,
): Promise<[string, string]> {
  const userKey = getReportUserKey(user);
  const prompt = createSummaryPrompt(user, resolved.visionByPreviewUrl);
  const sourceHash = getUserSummarySourceHash({ model: resolved.model, prompt, userKey });
  const cacheKey = getUserSummaryCacheKey(sourceHash);
  const cachedSummary = await getCachedSummary({ cacheKey, sourceHash, userKey, resolved });

  if (cachedSummary !== null) {
    resolved.logger.progress(current, total, {
      prefix: "user-summary",
      suffix: `cache hit ${userKey}`,
    });
    return [userKey, cachedSummary];
  }

  try {
    resolved.logger.progress(current, total, {
      prefix: "user-summary",
      suffix: `summarizing ${userKey}`,
    });
    const summary = await runSummaryForUser(user, userKey, cacheKey, sourceHash, resolved);
    resolved.logger.progress(current, total, {
      prefix: "user-summary",
      suffix: `summarized ${userKey}`,
    });
    return [userKey, summary];
  } catch (error) {
    const status = getHttpStatus(error);
    const message = error instanceof Error ? error.message : String(error);
    resolved.logger.warn(
      `could not summarize user ${userKey} with Ollama${
        status === null ? "" : ` HTTP ${status}`
      }: ${message}`,
    );
    return [userKey, USER_SUMMARY_UNAVAILABLE];
  }
}

export async function resolveUserSummariesForReport(
  report: StoriesManifestReport,
  options: ResolveUserSummariesOptions,
): Promise<Map<string, string>> {
  const resolved = resolveOptions(options);
  const summaryByUserKey = new Map<string, string>();

  for (const [index, user] of report.output.users.entries()) {
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
