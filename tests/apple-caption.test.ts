import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect, type TestContext } from "vitest";
import { resolveAppleCaptionsForReport } from "@@/core/vision/apple-caption.ts";
import { AppleOcrUnavailableError } from "@@/core/vision/apple-ocr.ts";
import { fetchStoriesManifest } from "@@/core/fetch-run/stories.ts";
import {
  createCapturingLogger,
  createClient,
  fixedNow,
  noSleep,
  reel,
  storyItem,
  reelsResponse,
} from "./mock-helpers.ts";
import { createTestRuntime } from "./setup/test-runtime.ts";

async function writeCachedPreviews(context: TestContext, mediaPks: Array<string>) {
  const cacheDirectory = await mkdtemp(path.join(tmpdir(), "slopstagram-captions-"));
  context.onTestFinished(async () => {
    await rm(cacheDirectory, { force: true, recursive: true });
  });
  await mkdir(path.join(cacheDirectory, "images/story-previews"), { recursive: true });
  await Promise.all(
    mediaPks.map(async (mediaPk) => {
      await writeFile(
        path.join(cacheDirectory, `images/story-previews/${mediaPk}.jpg`),
        Buffer.from(mediaPk),
      );
    }),
  );
  return {
    cacheDirectory,
    cachedImages: {
      profilePicPathByUrl: new Map<string, string>(),
      storyPreviewPathByUrl: new Map(
        mediaPks.map((mediaPk) => [
          `https://example.com/${mediaPk}.jpg`,
          `images/story-previews/${mediaPk}.jpg`,
        ]),
      ),
    },
  };
}

test("reads cached local previews and stops after the first unavailable result", async (context) => {
  const logger = createCapturingLogger();
  const recognizedImages: Array<string> = [];
  const runtime = await createTestRuntime(context, {
    logger,
    runAppleOcr: async (image) => {
      recognizedImages.push(Buffer.from(image).toString());
      throw new AppleOcrUnavailableError("Vision is unavailable");
    },
  });
  const client = createClient(
    [{ id: "r1", media_ids: ["m1", "m2"], user: { username: "one" } }],
    [reelsResponse({ r1: reel("r1", [storyItem("m1"), storyItem("m2")]) })],
  );
  const report = await fetchStoriesManifest(client, {
    logger,
    now: fixedNow,
    sleep: noSleep,
    storyRepository: runtime.stories,
    storyStorage: runtime.storage.stories,
  });
  const { cacheDirectory, cachedImages } = await writeCachedPreviews(context, ["m1", "m2"]);

  await resolveAppleCaptionsForReport(runtime, report, cachedImages, { cacheDirectory });

  expect(recognizedImages).toStrictEqual(["m1"]);
  expect(
    logger.messages.some((message) =>
      message.includes(
        "warn: apple ocr unavailable; skipping remaining captions: Vision is unavailable",
      ),
    ),
  ).toBeTruthy();
});

test("resolves local OCR without embedding it in the report", async (context) => {
  const logger = createCapturingLogger();
  const runtime = await createTestRuntime(context, {
    logger,
    runAppleOcr: async () => await Promise.resolve("local OCR text"),
  });
  const client = createClient(
    [{ id: "r1", media_ids: ["m1"], user: { username: "one" } }],
    [reelsResponse({ r1: reel("r1", [storyItem("m1")]) })],
  );
  const report = await fetchStoriesManifest(client, {
    logger,
    now: fixedNow,
    sleep: noSleep,
    storyRepository: runtime.stories,
    storyStorage: runtime.storage.stories,
  });
  const { cacheDirectory, cachedImages } = await writeCachedPreviews(context, ["m1"]);

  await resolveAppleCaptionsForReport(runtime, report, cachedImages, { cacheDirectory });

  expect(runtime.appleVision.findByMediaPk("m1")).toBe("local OCR text");
  expect("apple_caption" in report.output.users[0].stories[0]).toBe(false);
});
