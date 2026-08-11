import { createHash } from "node:crypto";
import path from "node:path";
import { Ollama as VisionSdk, type Fetch as VisionFetch } from "ollama";
import { getMediaCacheKey, visionStorage } from "./cache-service.ts";
import type { CachedReportImages } from "./image-cache-service.ts";
import type { Logger } from "./logging-service.ts";
import { noopLogger } from "./logging-service.ts";
import type {
  VisionCacheEntry,
  VisionResult,
  VisionStorage,
  StoriesManifestReport,
} from "./types.ts";

export const VISION_MODEL = "minicpm-v4.6";
export const VISION_PROMPT = `
    Describe the image in detail.
    First, extract any text that appears in the image. Provide a list of all visible text. Only if there is text.
    Then, provide a short description of the visual elements of the image. ignore all texts.
    \`\`\`json
  `;
export const VISION_SERVER_NOT_RUNNING = "vision server not running";

const VISION_OUTPUT_SCHEMA = {
  additionalProperties: false,
  properties: {
    description: {
      description:
        "Required. image description. Do not mention, text, quote, summarize, or translate any visible words, letters, captions, signs, labels, or phrases.",
      type: "string",
    },
    ocrText: {
      description: "Exact all OCR texts if any. Do not include any non-text image description.",
      items: {
        type: "string",
      },
      type: "array",
    },
  },
  required: ["ocrText", "description"],
  type: "object",
} as const;

type VisionOptions = {
  endpoint?: string;
  fetchVision?: VisionFetch;
  logger?: Logger;
  model?: string;
  prompt?: string;
  reportDirectory: string;
  storage?: VisionStorage;
};

type VisionClient = Pick<VisionSdk, "generate">;

type ResolvedVisionOptions = Required<
  Omit<VisionOptions, "endpoint" | "fetchVision" | "logger">
> & {
  mediaPk: string;
  logger: Logger;
  client: VisionClient;
};

function isUsableVisionCacheEntry(
  cachedEntry: VisionCacheEntry | null | undefined,
  options: {
    model: string;
    promptHash: string;
  },
): cachedEntry is VisionCacheEntry {
  return Boolean(
    cachedEntry &&
    cachedEntry.model === options.model &&
    cachedEntry.prompt_hash === options.promptHash,
  );
}

function getPromptHash(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

function normalizeVisionText(value: string): string {
  return value.normalize("NFC").trim();
}

function normalizeVisionResult(result: VisionResult): VisionResult {
  return {
    text: normalizeVisionText(result.text),
    visual: normalizeVisionText(result.visual),
  };
}

function createFailureResult(message: string): VisionResult {
  return {
    text: "",
    visual: message,
  };
}

function parseOcrText(value: unknown): string {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .map(normalizeVisionText)
        .filter(Boolean)
        .join("\n")
    : "";
}

function parseVisionResponse(value: unknown): VisionResult {
  if (typeof value !== "string") {
    return createFailureResult("vision failed: invalid response");
  }

  const response = normalizeVisionText(value);

  if (!response) {
    return { text: "", visual: "" };
  }

  try {
    const payload = JSON.parse(response) as {
      description?: unknown;
      ocrText?: unknown;
    };

    if (typeof payload.description === "string") {
      return normalizeVisionResult({
        text: parseOcrText(payload.ocrText),
        visual: payload.description,
      });
    }
  } catch {
    // Older providers or models may ignore structured output.
  }

  return {
    text: "",
    visual: response,
  };
}

function normalizeCachedResult(value: unknown): VisionResult | null {
  if (typeof value === "string") {
    return {
      text: "",
      visual: normalizeVisionText(value),
    };
  }

  if (
    value &&
    typeof value === "object" &&
    "text" in value &&
    "visual" in value &&
    typeof value.text === "string" &&
    typeof value.visual === "string"
  ) {
    return normalizeVisionResult({
      text: value.text,
      visual: value.visual,
    });
  }

  return null;
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

function getVisionHttpStatus(error: unknown): number | null {
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

function resolveVisionHost(endpoint: string | undefined): string {
  return (endpoint ?? "http://127.0.0.1:11434").replace(/\/api\/generate\/?$/, "");
}

function resolveReportImagePath(reportDirectory: string, imagePath: string): string {
  return path.isAbsolute(imagePath) ? imagePath : path.resolve(reportDirectory, imagePath);
}

async function analyzeImage(
  itemLabel: string,
  imagePath: string,
  options: ResolvedVisionOptions,
): Promise<VisionResult> {
  const cacheKey = getMediaCacheKey(options.mediaPk);
  const promptHash = getPromptHash(options.prompt);
  const cachedEntry = await options.storage.getItem(cacheKey);

  if (
    isUsableVisionCacheEntry(cachedEntry, {
      ...options,
      promptHash,
    })
  ) {
    const cachedResult = normalizeCachedResult(cachedEntry.result);

    if (cachedResult) {
      return cachedResult;
    }
  }

  try {
    const payload = await options.client.generate({
      format: VISION_OUTPUT_SCHEMA,
      images: [imagePath],
      model: options.model,
      options: {
        temperature: 0.1,
      },
      prompt: options.prompt,
      stream: false,
    });
    const result = parseVisionResponse(payload.response);

    await options.storage.setItem(cacheKey, {
      model: options.model,
      prompt_hash: promptHash,
      result,
    });

    return result;
  } catch (error) {
    const status = getVisionHttpStatus(error);

    if (status !== null) {
      return createFailureResult(
        status === 0 ? VISION_SERVER_NOT_RUNNING : `vision failed: HTTP ${status}`,
      );
    }

    if (isServerUnavailableError(error)) {
      options.logger.warn(`vision unavailable for ${itemLabel}`);
      return createFailureResult(VISION_SERVER_NOT_RUNNING);
    }

    const message = error instanceof Error ? error.message : String(error);
    options.logger.warn(`could not run vision for ${itemLabel}: ${message}`);
    return createFailureResult(`vision failed: ${message}`);
  }
}

export async function resolveVisionForReport(
  report: StoriesManifestReport,
  cachedImages: CachedReportImages,
  options: VisionOptions,
): Promise<Map<string, VisionResult>> {
  const host = resolveVisionHost(options.endpoint);
  const client = new VisionSdk({ fetch: options.fetchVision, host });
  const logger = options.logger ?? noopLogger;
  const model = options.model ?? VISION_MODEL;
  const prompt = options.prompt ?? VISION_PROMPT;
  const storage = options.storage ?? visionStorage;
  const resultByPreviewUrl = new Map<string, VisionResult>();
  const previewEntries = report.output.users
    .flatMap((user) =>
      user.stories.map((story) => ({
        mediaPk: story.media_pk,
        source: story.preview_image_url?.trim() ?? null,
      })),
    )
    .filter((entry): entry is { mediaPk: string; source: string } => Boolean(entry.source));
  const entriesByMediaPk = new Map<string, { mediaPk: string; source: string }>();
  const sourcesByMediaPk = new Map<string, string[]>();

  for (const entry of previewEntries) {
    entriesByMediaPk.set(entry.mediaPk, entry);
    sourcesByMediaPk.set(entry.mediaPk, [
      ...(sourcesByMediaPk.get(entry.mediaPk) ?? []),
      entry.source,
    ]);
  }

  const uniquePreviewEntries = [...entriesByMediaPk.values()];

  for (const [index, { mediaPk, source }] of uniquePreviewEntries.entries()) {
    const cachedPath = cachedImages.storyPreviewPathByUrl.get(source);
    const current = index + 1;
    const total = uniquePreviewEntries.length;
    const cacheKey = getMediaCacheKey(mediaPk);
    const itemLabel = cachedPath ?? `vision/${cacheKey}`;

    if (!cachedPath) {
      logger.progress(index, total, {
        prefix: "vision",
        suffix: `missing ${itemLabel}`,
      });
      logger.warn(`vision skipped for ${itemLabel}: no cached preview`);
      logger.progress(current, total, {
        prefix: "vision",
        suffix: `skipped ${itemLabel}`,
      });
      for (const previewSource of sourcesByMediaPk.get(mediaPk) ?? [source]) {
        resultByPreviewUrl.set(
          previewSource,
          createFailureResult("vision failed: no cached preview"),
        );
      }
      continue;
    }

    if (path.extname(cachedPath).toLowerCase() !== ".jpg") {
      logger.progress(index, total, {
        prefix: "vision",
        suffix: `checking ${itemLabel}`,
      });
      logger.warn(`vision skipped for ${itemLabel}: preview is not JPEG`);
      logger.progress(current, total, {
        prefix: "vision",
        suffix: `skipped ${itemLabel}`,
      });
      for (const previewSource of sourcesByMediaPk.get(mediaPk) ?? [source]) {
        resultByPreviewUrl.set(
          previewSource,
          createFailureResult("vision failed: preview is not JPEG"),
        );
      }
      continue;
    }

    const imagePath = resolveReportImagePath(options.reportDirectory, cachedPath);
    logger.progress(index, total, {
      prefix: "vision",
      suffix: `resolving ${itemLabel}`,
    });
    const result = await analyzeImage(itemLabel, imagePath, {
      mediaPk,
      logger,
      model,
      client,
      prompt,
      reportDirectory: options.reportDirectory,
      storage,
    });

    for (const previewSource of sourcesByMediaPk.get(mediaPk) ?? [source]) {
      resultByPreviewUrl.set(previewSource, result);
    }
  }

  return resultByPreviewUrl;
}
