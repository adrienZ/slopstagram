import { createHash } from "node:crypto";
import path from "node:path";
import { Ollama, type Fetch as OllamaFetch } from "ollama";
import {
  getOllamaVisionCacheKey,
  ollamaVisionStorage,
} from "./cache-service.ts";
import type { CachedReportImages } from "./image-cache-service.ts";
import type { Logger } from "./logging-service.ts";
import { noopLogger } from "./logging-service.ts";
import type {
  OllamaVisionCacheEntry,
  OllamaVisionStorage,
  StoriesManifestReport,
} from "./types.ts";

export const OLLAMA_VISION_MODEL = "minicpm-v4.6";
export const OLLAMA_VISION_PROMPT =
  "Describe this image.";
export const OLLAMA_SERVER_NOT_RUNNING = "ollama server not running";

type OllamaVisionOptions = {
  endpoint?: string;
  fetchOllama?: OllamaFetch;
  logger?: Logger;
  model?: string;
  prompt?: string;
  reportDirectory: string;
  storage?: OllamaVisionStorage;
};

type OllamaClient = Pick<Ollama, "generate">;

type ResolvedOllamaVisionOptions = Required<
  Omit<OllamaVisionOptions, "endpoint" | "fetchOllama" | "logger">
> & {
  cacheIdentity: string;
  logger: Logger;
  ollama: OllamaClient;
};

function isUsableOllamaCacheEntry(
  cachedEntry: OllamaVisionCacheEntry | null | undefined,
  options: {
    cacheIdentity: string;
    model: string;
    prompt: string;
    source: string;
  },
): cachedEntry is OllamaVisionCacheEntry {
  return Boolean(
    cachedEntry &&
      cachedEntry.cache_identity === options.cacheIdentity &&
      cachedEntry.model === options.model &&
      cachedEntry.prompt === options.prompt,
  );
}

function getImageHash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function normalizeOllamaText(value: string): string {
  return value.normalize("NFC").trim();
}

function isServerUnavailableError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof Error) {
    return /ECONNREFUSED|fetch failed|connect|socket|network/i.test(error.message);
  }

  return false;
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

function resolveReportImagePath(reportDirectory: string, imagePath: string): string {
  return path.isAbsolute(imagePath)
    ? imagePath
    : path.resolve(reportDirectory, imagePath);
}

async function describeImageWithOllama(
  source: string,
  imagePath: string,
  options: ResolvedOllamaVisionOptions,
): Promise<string> {
  const imageHash = getImageHash(options.cacheIdentity);
  const cacheKey = getOllamaVisionCacheKey(imageHash, options.model);
  const cachedEntry = await options.storage.getItem(cacheKey);

  if (isUsableOllamaCacheEntry(cachedEntry, { ...options, source })) {
    options.logger.info(`ollama vision cache hit for ${source}`);
    return cachedEntry.result;
  }

  try {
    options.logger.info(`ollama vision started for ${source}`);
    const payload = await options.ollama.generate({
      images: [imagePath],
      model: options.model,
      prompt: options.prompt,
      stream: false,
    });
    const result =
      typeof payload.response === "string"
        ? normalizeOllamaText(payload.response)
        : "ollama vision failed: invalid response";

    await options.storage.setItem(cacheKey, {
      cache_identity: options.cacheIdentity,
      image_path: imagePath,
      model: options.model,
      prompt: options.prompt,
      result,
      source,
    });

    options.logger.info(`ollama vision completed for ${source}`);
    return result;
  } catch (error) {
    const status = getOllamaHttpStatus(error);

    if (status !== null) {
      return status === 0 ? OLLAMA_SERVER_NOT_RUNNING : `ollama vision failed: HTTP ${status}`;
    }

    if (isServerUnavailableError(error)) {
      options.logger.warn(`ollama vision unavailable for ${source}`);
      return OLLAMA_SERVER_NOT_RUNNING;
    }

    const message = error instanceof Error ? error.message : String(error);
    options.logger.warn(`could not run ollama vision for ${source}: ${message}`);
    return `ollama vision failed: ${message}`;
  }
}

export async function resolveOllamaVisionForReport(
  report: StoriesManifestReport,
  cachedImages: CachedReportImages,
  options: OllamaVisionOptions,
): Promise<Map<string, string>> {
  const host = resolveOllamaHost(options.endpoint);
  const ollama = new Ollama({ fetch: options.fetchOllama, host });
  const logger = options.logger ?? noopLogger;
  const model = options.model ?? OLLAMA_VISION_MODEL;
  const prompt = options.prompt ?? OLLAMA_VISION_PROMPT;
  const storage = options.storage ?? ollamaVisionStorage;
  const resultByPreviewUrl = new Map<string, string>();
  const previewEntries = report.output.users
    .flatMap((user) =>
      user.stories.map((story) => ({
        cacheIdentity: story.media_pk,
        source: story.preview_image_url?.trim() ?? null,
      })),
    )
    .filter(
      (entry): entry is { cacheIdentity: string; source: string } =>
        Boolean(entry.source),
    );
  const entriesByIdentity = new Map<string, { cacheIdentity: string; source: string }>();
  const sourcesByIdentity = new Map<string, string[]>();

  for (const entry of previewEntries) {
    entriesByIdentity.set(entry.cacheIdentity, entry);
    sourcesByIdentity.set(entry.cacheIdentity, [
      ...(sourcesByIdentity.get(entry.cacheIdentity) ?? []),
      entry.source,
    ]);
  }

  const uniquePreviewEntries = [...entriesByIdentity.values()];

  for (const [index, { cacheIdentity, source }] of uniquePreviewEntries.entries()) {
    logger.progress("ollama vision", index + 1, uniquePreviewEntries.length);
    const cachedPath = cachedImages.storyPreviewPathByUrl.get(source);

    if (!cachedPath) {
      logger.warn(`ollama vision skipped for ${source}: no cached preview`);
      for (const previewSource of sourcesByIdentity.get(cacheIdentity) ?? [source]) {
        resultByPreviewUrl.set(previewSource, "ollama vision failed: no cached preview");
      }
      continue;
    }

    if (path.extname(cachedPath).toLowerCase() !== ".jpg") {
      logger.warn(`ollama vision skipped for ${source}: preview is not JPEG`);
      for (const previewSource of sourcesByIdentity.get(cacheIdentity) ?? [source]) {
        resultByPreviewUrl.set(previewSource, "ollama vision failed: preview is not JPEG");
      }
      continue;
    }

    const imagePath = resolveReportImagePath(options.reportDirectory, cachedPath);
    const result = await describeImageWithOllama(source, imagePath, {
      cacheIdentity,
      logger,
      model,
      ollama,
      prompt,
      reportDirectory: options.reportDirectory,
      storage,
    });

    for (const previewSource of sourcesByIdentity.get(cacheIdentity) ?? [source]) {
      resultByPreviewUrl.set(previewSource, result);
    }
  }

  return resultByPreviewUrl;
}
