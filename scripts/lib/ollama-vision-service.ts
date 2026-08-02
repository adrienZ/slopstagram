import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  getOllamaVisionCacheKey,
  ollamaVisionStorage,
} from "./cache-service.ts";
import type { CachedReportImages } from "./image-cache-service.ts";
import type { Logger } from "./logging-service.ts";
import { noopLogger } from "./logging-service.ts";
import type {
  OllamaVisionStorage,
  StoriesManifestReport,
} from "./types.ts";

export const OLLAMA_VISION_MODEL = "qwen2.5vl:3b";
export const OLLAMA_VISION_PROMPT =
  "Describe this image";
export const OLLAMA_SERVER_NOT_RUNNING = "ollama server not running";

type FetchOllama = typeof fetch;

type OllamaVisionOptions = {
  endpoint?: string;
  fetchOllama?: FetchOllama;
  logger?: Logger;
  model?: string;
  prompt?: string;
  reportDirectory: string;
  storage?: OllamaVisionStorage;
};

type OllamaGenerateResponse = {
  response?: unknown;
};

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

function resolveReportImagePath(reportDirectory: string, imagePath: string): string {
  return path.isAbsolute(imagePath)
    ? imagePath
    : path.resolve(reportDirectory, imagePath);
}

async function describeImageWithOllama(
  source: string,
  imagePath: string,
  options: Required<Omit<OllamaVisionOptions, "logger">> & { logger: Logger },
): Promise<string> {
  const imageHash = getImageHash(source);
  const cacheKey = getOllamaVisionCacheKey(imageHash, options.model);
  const cachedEntry = await options.storage.getItem(cacheKey);

  if (
    cachedEntry &&
    cachedEntry.source === source &&
    cachedEntry.model === options.model &&
    cachedEntry.prompt === options.prompt &&
    cachedEntry.image_path === imagePath
  ) {
    return cachedEntry.result;
  }

  try {
    const image = await readFile(imagePath);
    const response = await options.fetchOllama(options.endpoint, {
      body: JSON.stringify({
        images: [image.toString("base64")],
        model: options.model,
        prompt: options.prompt,
        stream: false,
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      return response.status === 0
        ? OLLAMA_SERVER_NOT_RUNNING
        : `ollama vision failed: HTTP ${response.status}`;
    }

    const payload = (await response.json()) as OllamaGenerateResponse;
    const result =
      typeof payload.response === "string"
        ? normalizeOllamaText(payload.response)
        : "ollama vision failed: invalid response";

    await options.storage.setItem(cacheKey, {
      image_path: imagePath,
      model: options.model,
      prompt: options.prompt,
      result,
      source,
    });

    return result;
  } catch (error) {
    if (isServerUnavailableError(error)) {
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
  const endpoint = options.endpoint ?? "http://127.0.0.1:11434/api/generate";
  const fetchOllama = options.fetchOllama ?? fetch;
  const logger = options.logger ?? noopLogger;
  const model = options.model ?? OLLAMA_VISION_MODEL;
  const prompt = options.prompt ?? OLLAMA_VISION_PROMPT;
  const storage = options.storage ?? ollamaVisionStorage;
  const resultByPreviewUrl = new Map<string, string>();
  const previewUrls = report.output.users
    .flatMap((user) => user.stories.map((story) => story.preview_image_url?.trim() ?? null))
    .filter((value): value is string => Boolean(value));

  for (const source of new Set(previewUrls)) {
    const cachedPath = cachedImages.storyPreviewPathByUrl.get(source);

    if (!cachedPath) {
      resultByPreviewUrl.set(source, "ollama vision failed: no cached preview");
      continue;
    }

    if (path.extname(cachedPath).toLowerCase() !== ".jpg") {
      resultByPreviewUrl.set(source, "ollama vision failed: preview is not JPEG");
      continue;
    }

    const imagePath = resolveReportImagePath(options.reportDirectory, cachedPath);
    const result = await describeImageWithOllama(source, imagePath, {
      endpoint,
      fetchOllama,
      logger,
      model,
      prompt,
      reportDirectory: options.reportDirectory,
      storage,
    });

    resultByPreviewUrl.set(source, result);
  }

  return resultByPreviewUrl;
}
