import { readFile } from "node:fs/promises";
import process from "node:process";
import { appleCaptionsStorage, getMediaCacheKey } from "./cache-service.ts";
import { NO_APPLE_CAPTION } from "./report-constants.ts";
import type { AppleCaptionStorage } from "./types.ts";

type AppleOcrRunner = (image: Uint8Array) => Promise<string>;
type ReadImage = (imagePath: string) => Promise<Uint8Array>;

export class AppleOcrUnavailableError extends Error {
  readonly kind = "unavailable";
}

export type RecognizeAppleCaptionOptions = {
  platform?: NodeJS.Platform;
  readImage?: ReadImage;
  runAppleOcr?: AppleOcrRunner;
  storage?: AppleCaptionStorage;
};

function normalizeOcrText(value: string): string {
  const normalized = value.normalize("NFC").replaceAll("\r\n", "\n").trim();

  return normalized.length > 0 ? normalized : NO_APPLE_CAPTION;
}

export function isAppleOcrUnavailable(error: unknown): error is Error & { kind: "unavailable" } {
  return error instanceof Error && "kind" in error && error.kind === "unavailable";
}

async function runAppleOcr(image: Uint8Array, platform: NodeJS.Platform): Promise<string> {
  if (platform !== "darwin") {
    throw new AppleOcrUnavailableError(`unsupported platform ${platform}`);
  }

  let macOcr: typeof import("mac-ocr");
  try {
    macOcr = await import("mac-ocr");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AppleOcrUnavailableError(`mac-ocr package is unavailable: ${message}`);
  }

  const result = await macOcr.ocr(image);
  return result.text;
}

export async function recognizeAppleCaption(
  mediaPk: string,
  imagePath: string,
  {
    platform = process.platform,
    readImage: read = (path) => readFile(path),
    runAppleOcr: runOcr = (image) => runAppleOcr(image, platform),
    storage = appleCaptionsStorage,
  }: RecognizeAppleCaptionOptions = {},
): Promise<string> {
  const cacheKey = getMediaCacheKey(mediaPk);
  const cachedCaption = await storage.getItem(cacheKey);

  if (cachedCaption !== null && cachedCaption.length > 0) {
    return cachedCaption;
  }

  const caption = normalizeOcrText(await runOcr(await read(imagePath)));
  await storage.setItem(cacheKey, caption);
  return caption;
}
