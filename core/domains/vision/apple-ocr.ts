import process from "node:process";
import type { AppleVisionRepository } from "@@/core/domains/database/repositories/apple-vision-repository.ts";
import { readCachedImage } from "@@/core/domains/media-store/image-cache.ts";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import { NO_APPLE_CAPTION } from "@@/core/utils/report-constants.ts";

export class AppleOcrUnavailableError extends Error {
  override readonly name = "AppleOcrUnavailableError";
  readonly kind = "unavailable";
}

export interface RecognizeAppleCaptionOptions {
  platform?: NodeJS.Platform;
}

function normalizeOcrText(value: string): string {
  const normalized = value.normalize("NFC").replaceAll("\r\n", "\n").trim();

  return normalized.length > 0 ? normalized : NO_APPLE_CAPTION;
}

export function isAppleOcrUnavailable(error: Error): error is AppleOcrUnavailableError {
  return error instanceof AppleOcrUnavailableError;
}

async function runAppleOcr(image: Uint8Array, platform: NodeJS.Platform): Promise<string> {
  if (platform !== "darwin") {
    throw new AppleOcrUnavailableError(`unsupported platform ${platform}`);
  }

  // oxlint-disable-next-line typescript/consistent-type-imports keep it async for non macOS platforms
  let macOcr: typeof import("mac-ocr");
  try {
    macOcr = await import("mac-ocr");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown import failure";
    throw new AppleOcrUnavailableError(`mac-ocr package is unavailable: ${message}`);
  }

  const result = await macOcr.ocr(image);
  return result.text;
}

export async function recognizeAppleCaption(
  runtime: Pick<Runtime, "runAppleOcr" | "storage"> & {
    appleVision: Pick<AppleVisionRepository, "findByMediaPk" | "save">;
  },
  mediaPk: string,
  cachedPath: string,
  { platform = process.platform }: RecognizeAppleCaptionOptions = {},
): Promise<string> {
  const repository = runtime.appleVision;
  const runOcr = runtime.runAppleOcr ?? (async (image) => await runAppleOcr(image, platform));
  const storedCaption = repository.findByMediaPk(mediaPk);

  if (storedCaption !== null && storedCaption.length > 0) {
    return storedCaption;
  }

  const image = await readCachedImage(runtime.storage.images, cachedPath);
  if (image === null) {
    throw new Error(`cached image ${cachedPath} is missing`);
  }

  const caption = normalizeOcrText(await runOcr(image));
  await repository.save(mediaPk, caption);
  return caption;
}
