import { spawn } from "node:child_process";
import { appleCaptionsStorage, getMediaCacheKey } from "./cache-service.ts";
import { getLargestVersion } from "./parser-service.ts";
import { NO_APPLE_CAPTION } from "./report-constants.ts";
import type { AppleCaptionStorage, StoryItem } from "./types.ts";

type AppleOcrRunner = (source: string) => Promise<string>;

export type RecognizeAppleCaptionOptions = {
  runAppleOcr?: AppleOcrRunner;
  storage?: AppleCaptionStorage;
};

function getOcrSource(story: StoryItem): string | null {
  const candidate = getLargestVersion(story.image_versions2?.candidates);
  return candidate?.url ?? null;
}

function normalizeOcrText(value: string): string {
  const normalized = value.normalize("NFC").replace(/\r\n/g, "\n").trim();

  return normalized.length > 0 ? normalized : NO_APPLE_CAPTION;
}

async function runAppleOcr(source: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("mac-ocr", [source], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr.trim() || `mac-ocr exited with code ${code ?? "unknown"}`));
    });
  });
}

export async function recognizeAppleCaption(
  story: StoryItem,
  {
    runAppleOcr: runOcr = runAppleOcr,
    storage = appleCaptionsStorage,
  }: RecognizeAppleCaptionOptions = {},
): Promise<string> {
  const source = getOcrSource(story);
  const cacheKey = getMediaCacheKey(story.pk);
  const cachedCaption = await storage.getItem(cacheKey);

  if (cachedCaption) {
    return cachedCaption;
  }

  if (!source) {
    return NO_APPLE_CAPTION;
  }

  const caption = normalizeOcrText(await runOcr(source));
  await storage.setItem(cacheKey, caption);
  return caption;
}
