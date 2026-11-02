import { Buffer } from "node:buffer";
import { test, expect } from "vitest";
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

async function cachePreviews(
  runtime: Awaited<ReturnType<typeof createTestRuntime>>,
  mediaPks: Array<string>,
) {
  await Promise.all(
    mediaPks.map(async (mediaPk) => {
      await runtime.storage.images.setItemRaw(
        `story-previews/${mediaPk}.jpg`,
        Buffer.from(mediaPk),
      );
    }),
  );
  return {
    profilePicPathByUrl: new Map<string, string>(),
    storyPreviewPathByUrl: new Map(
      mediaPks.map((mediaPk) => [
        `https://example.com/${mediaPk}.jpg`,
        `images/story-previews/${mediaPk}.jpg`,
      ]),
    ),
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
  const report = await fetchStoriesManifest(runtime, client, { now: fixedNow, sleep: noSleep });
  const cachedImages = await cachePreviews(runtime, ["m1", "m2"]);

  await resolveAppleCaptionsForReport(runtime, report, cachedImages);

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
  const report = await fetchStoriesManifest(runtime, client, { now: fixedNow, sleep: noSleep });
  const cachedImages = await cachePreviews(runtime, ["m1"]);

  await resolveAppleCaptionsForReport(runtime, report, cachedImages);

  expect(runtime.appleVision.findByMediaPk("m1")).toBe("local OCR text");
  expect("apple_caption" in report.output.users[0].stories[0]).toBe(false);
});
