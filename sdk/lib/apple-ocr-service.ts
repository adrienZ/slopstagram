import { readFile } from "node:fs/promises";
import { MacOcrError, ocr } from "mac-ocr";
import { appleCaptionsStorage, getMediaCacheKey } from "./cache-service.ts";
import { NO_APPLE_CAPTION } from "./report-constants.ts";
import type { AppleCaptionStorage } from "./types.ts";

type AppleOcrRunner = (image: Uint8Array) => Promise<string>;
type ReadImage = (imagePath: string) => Promise<Uint8Array>;

export type RecognizeAppleCaptionOptions = {
  readImage?: ReadImage;
  runAppleOcr?: AppleOcrRunner;
  storage?: AppleCaptionStorage;
};

function normalizeOcrText(value: string): string {
  const normalized = value.normalize("NFC").replaceAll("\r\n", "\n").trim();

  return normalized.length > 0 ? normalized : NO_APPLE_CAPTION;
}

export function isAppleOcrUnavailable(error: unknown): error is MacOcrError {
  return error instanceof MacOcrError && error.kind === "unavailable";
}

async function runAppleOcr(image: Uint8Array): Promise<string> {
  const result = await ocr(image);
  return result.text;
}

export async function recognizeAppleCaption(
  mediaPk: string,
  imagePath: string,
  {
    readImage: read = (path) => readFile(path),
    runAppleOcr: runOcr = runAppleOcr,
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
