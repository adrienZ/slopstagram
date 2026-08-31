import { createHash } from "node:crypto";
import type { Ollama as VisionSdk } from "ollama";
import { z } from "zod";
import type { VisionRepository } from "../entities/vision.ts";
import type { Logger } from "./logging-service.ts";
import type { VisionEntry, VisionResult } from "./types.ts";

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
  repository: Pick<VisionRepository, "findByMediaPk" | "save">;
};

function isUsableVisionEntry(
  entry: VisionEntry | null | undefined,
  options: {
    model: string;
    promptHash: string;
  },
): entry is VisionEntry {
  return Boolean(
    entry && entry.model === options.model && entry.prompt_hash === options.promptHash,
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

function parseVisionResponse(value: string): VisionResult {
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

function isServerUnavailableError(error: Error): boolean {
  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof Error) {
    return /ECONNREFUSED|fetch failed|connect|socket|network/iu.test(error.message);
  }

  return false;
}

const VisionHttpErrorSchema = z
  .object({ status_code: z.number() })
  .transform(({ status_code }) => ({ status_code }));
type VisionRequestError = Error | z.output<typeof VisionHttpErrorSchema>;

function getVisionHttpStatus(error: VisionRequestError): number | null {
  return "status_code" in error ? error.status_code : null;
}

async function getStoredVisionResult(
  promptHash: string,
  options: ResolvedVisionOptions,
): Promise<VisionResult | null> {
  const entry = await options.repository.findByMediaPk(options.mediaPk);

  if (isUsableVisionEntry(entry, { ...options, promptHash })) {
    return normalizeVisionResult(entry.result);
  }

  return null;
}

async function runVisionRequest(
  imagePath: string,
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

  await options.repository.save(options.mediaPk, {
    model: options.model,
    prompt_hash: promptHash,
    result,
  });

  return result;
}

function handleVisionError(
  error: VisionRequestError,
  itemLabel: string,
  options: ResolvedVisionOptions,
): VisionResult {
  const status = getVisionHttpStatus(error);

  if (status !== null) {
    return createFailureResult(
      status === 0 ? VISION_SERVER_NOT_RUNNING : `vision failed: HTTP ${status}`,
    );
  }

  if (error instanceof Error && isServerUnavailableError(error)) {
    options.logger.warn(`vision unavailable for ${itemLabel}`);
    return createFailureResult(VISION_SERVER_NOT_RUNNING);
  }

  const message = error instanceof Error ? error.message : "unknown request error";
  options.logger.warn(`could not run vision for ${itemLabel}: ${message}`);
  return createFailureResult(`vision failed: ${message}`);
}

export async function analyzeImage(
  itemLabel: string,
  imagePath: string,
  options: ResolvedVisionOptions,
): Promise<VisionResult> {
  const promptHash = getPromptHash(options.prompt);
  const storedResult = await getStoredVisionResult(promptHash, options);

  if (storedResult) {
    return storedResult;
  }

  try {
    return await runVisionRequest(imagePath, promptHash, options);
  } catch (error) {
    const httpError = VisionHttpErrorSchema.safeParse(error);
    const requestError = httpError.success
      ? httpError.data
      : error instanceof Error
        ? error
        : new Error("unknown request error");
    return handleVisionError(requestError, itemLabel, options);
  }
}
