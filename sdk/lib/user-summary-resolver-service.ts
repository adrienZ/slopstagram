import type { UserSummaryRepository } from "../entities/user-summary.ts";
import { userSummaryRepository } from "./entity-repository-service.ts";
import { getReportUserKey } from "./report-user-key-service.ts";
import type { StoriesManifestReport, StoryOutputUser, VisionResult } from "./types.ts";
import {
  createDefaultOllamaRunner,
  createFallbackSummary,
  createSummaryPrompt,
  getHttpStatus,
  getUserSummaryPromptHash,
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
  repository: Pick<UserSummaryRepository, "findBySourceHash" | "save">;
  visionByPreviewUrl?: Map<string, VisionResult>;
};

const USER_SUMMARY_PROMPT_HASH = getUserSummaryPromptHash(USER_SUMMARY_PROMPT);

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
    repository: options.repository ?? userSummaryRepository,
    visionByPreviewUrl: options.visionByPreviewUrl,
  };
}

async function getStoredSummary(options: {
  sourceHash: string;
  userKey: string;
  resolved: ResolvedUserSummaryOptions;
}): Promise<string | null> {
  const entry = await options.resolved.repository.findBySourceHash(options.sourceHash);

  if (
    entry?.source_hash === options.sourceHash &&
    entry.prompt_hash === USER_SUMMARY_PROMPT_HASH &&
    entry.user_key === options.userKey
  ) {
    return isUsableSummary(entry.result) ? entry.result : null;
  }

  return null;
}

async function runSummaryForUser(
  user: StoryOutputUser,
  userKey: string,
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

  await resolved.repository.save({
    prompt_hash: USER_SUMMARY_PROMPT_HASH,
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
  const storedSummary = await getStoredSummary({ sourceHash, userKey, resolved });

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
    const summary = await runSummaryForUser(user, userKey, sourceHash, resolved);
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
