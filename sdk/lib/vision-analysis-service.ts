import { createHash } from "node:crypto";
import type { Ollama as VisionSdk } from "ollama";
import { z } from "zod";
import { getMediaCacheKey } from "./cache-service.ts";
import type { Logger } from "./logging-service.ts";
import type { VisionCacheEntry, VisionResult, VisionStorage } from "./types.ts";

export const VISION_MODEL = "minicpm-v4.6";
export const VISION_PROMPT = `
    Describe the image in detail.
    First, extract any text that appears in the image. Provide a list of all visible text. Only if there is text.
    Then, provide a short description of the visual elements of the image. ignore all texts.
    \`\`\`json
  `;
export const VISION_SERVER_NOT_RUNNING = "vision server not running";

const VisionResponseSchema = z
  .object({
    description: z
      .string()
      .describe(
        "Required. image description. Do not mention, text, quote, summarize, or translate any visible words, letters, captions, signs, labels, or phrases.",
      ),
    ocrText: z
      .array(z.string())
      .describe("Exact all OCR texts if any. Do not include any non-text image description."),
  })
  .strict();
const VISION_OUTPUT_SCHEMA = z.toJSONSchema(VisionResponseSchema);

type VisionClient = Pick<VisionSdk, "generate">;

export type ResolvedVisionOptions = {
  client: VisionClient;
  logger: Logger;
  mediaPk: string;
  model: string;
  prompt: string;
  reportDirectory: string;
  storage: VisionStorage;
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

export function createFailureResult(message: string): VisionResult {
  return {
    text: "",
    visual: message,
  };
}

function parseOcrText(value: string[]): string {
  return value
    .map((entry) => normalizeVisionText(entry))
    .filter((entry) => entry.length > 0)
    .join("\n");
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
    const payload = VisionResponseSchema.parse(JSON.parse(response));

    return normalizeVisionResult({
      text: parseOcrText(payload.ocrText),
      visual: payload.description,
    });
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
    value !== null &&
    value !== undefined &&
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
    return /ECONNREFUSED|fetch failed|connect|socket|network/iu.test(error.message);
  }

  return false;
}

function getVisionHttpStatus(error: unknown): number | null {
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

async function getCachedVisionResult(
  cacheKey: string,
  promptHash: string,
  options: ResolvedVisionOptions,
): Promise<VisionResult | null> {
  const cachedEntry = await options.storage.getItem(cacheKey);

  if (isUsableVisionCacheEntry(cachedEntry, { ...options, promptHash })) {
    return normalizeCachedResult(cachedEntry.result);
  }

  return null;
}

async function runVisionRequest(
  imagePath: string,
  cacheKey: string,
  promptHash: string,
  options: ResolvedVisionOptions,
): Promise<VisionResult> {
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
}

function handleVisionError(
  error: unknown,
  itemLabel: string,
  options: ResolvedVisionOptions,
): VisionResult {
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

export async function analyzeImage(
  itemLabel: string,
  imagePath: string,
  options: ResolvedVisionOptions,
): Promise<VisionResult> {
  const cacheKey = getMediaCacheKey(options.mediaPk);
  const promptHash = getPromptHash(options.prompt);
  const cachedResult = await getCachedVisionResult(cacheKey, promptHash, options);

  if (cachedResult) {
    return cachedResult;
  }

  try {
    return await runVisionRequest(imagePath, cacheKey, promptHash, options);
  } catch (error) {
    return handleVisionError(error, itemLabel, options);
  }
}
