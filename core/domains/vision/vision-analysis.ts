import { createHash } from "node:crypto";
import { z } from "zod";
import type { VisionRepository } from "@@/core/domains/database/repositories/vision-repository.ts";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import { getOllamaClient } from "./ollama.ts";
import type { VisionEntry, VisionResult } from "@@/core/domains/database/entities/vision.ts";

const VISION_MODEL = "minicpm-v4.6";
const VISION_PROMPT = `
    Describe the image in detail.
    First, extract any text that appears in the image. Provide a list of all visible text. Only if there is text.
    Then, provide a short description of the visual elements of the image. ignore all texts.
    \`\`\`json
  `;
const VISION_SERVER_NOT_RUNNING = "vision server not running";

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

const VISION_PROMPT_HASH = createHash("sha256").update(VISION_PROMPT).digest("hex");

export type VisionRuntime = Pick<Runtime, "fetchOllama" | "logger"> & {
  vision: Pick<VisionRepository, "findByMediaPk" | "save">;
};

export interface VisionImage {
  itemLabel: string;
  mediaPk: string;
  read: () => Promise<Uint8Array>;
}

function isCurrentVisionEntry(entry: VisionEntry | null | undefined): entry is VisionEntry {
  return entry?.model === VISION_MODEL && entry.prompt_hash === VISION_PROMPT_HASH;
}

/** Returns a saved vision result only when the current model and prompt produced it. */
export function readCurrentVisionResult(entry: VisionEntry | null): VisionResult | null {
  return isCurrentVisionEntry(entry) ? entry.result : null;
}

export interface OutdatedVision {
  currentModel: string;
  currentPromptHash: string;
  model: string;
  promptHash: string;
}

/** Describes how a saved vision entry differs from the current model and prompt, or null when it matches. */
export function describeOutdatedVision(entry: VisionEntry | null): OutdatedVision | null {
  if (entry === null || readCurrentVisionResult(entry) !== null) {
    return null;
  }
  return {
    currentModel: VISION_MODEL,
    currentPromptHash: VISION_PROMPT_HASH,
    model: entry.model,
    promptHash: entry.prompt_hash,
  };
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

function parseOcrText(value: Array<string>): string {
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

function getStoredVisionResult(runtime: VisionRuntime, mediaPk: string): VisionResult | null {
  const entry = runtime.vision.findByMediaPk(mediaPk);

  if (isCurrentVisionEntry(entry)) {
    return normalizeVisionResult(entry.result);
  }

  return null;
}

async function runVisionRequest(runtime: VisionRuntime, image: VisionImage): Promise<VisionResult> {
  const client = getOllamaClient({ fetch: runtime.fetchOllama });
  const payload = await client.generate({
    format: VISION_OUTPUT_SCHEMA,
    images: [await image.read()],
    model: VISION_MODEL,
    options: {
      temperature: 0.1,
    },
    prompt: VISION_PROMPT,
    stream: false,
  });
  const result = parseVisionResponse(payload.response ?? "");

  await runtime.vision.save(image.mediaPk, {
    model: VISION_MODEL,
    prompt_hash: VISION_PROMPT_HASH,
    result,
  });

  return result;
}

function handleVisionError(
  runtime: VisionRuntime,
  error: VisionRequestError,
  itemLabel: string,
): VisionResult {
  const status = getVisionHttpStatus(error);

  if (status !== null) {
    return createFailureResult(
      status === 0 ? VISION_SERVER_NOT_RUNNING : `vision failed: HTTP ${status}`,
    );
  }

  if (error instanceof Error && isServerUnavailableError(error)) {
    runtime.logger.warn(`vision unavailable for ${itemLabel}`);
    return createFailureResult(VISION_SERVER_NOT_RUNNING);
  }

  const message = error instanceof Error ? error.message : "unknown request error";
  runtime.logger.warn(`could not run vision for ${itemLabel}: ${message}`);
  return createFailureResult(`vision failed: ${message}`);
}

export async function analyzeImage(
  runtime: VisionRuntime,
  image: VisionImage,
): Promise<VisionResult> {
  const storedResult = getStoredVisionResult(runtime, image.mediaPk);

  if (storedResult) {
    return storedResult;
  }

  try {
    return await runVisionRequest(runtime, image);
  } catch (error) {
    const httpError = VisionHttpErrorSchema.safeParse(error);
    let requestError: VisionRequestError;
    if (httpError.success) {
      requestError = httpError.data;
    } else if (error instanceof Error) {
      requestError = error;
    } else {
      requestError = new Error("unknown request error");
    }
    return handleVisionError(runtime, requestError, image.itemLabel);
  }
}
