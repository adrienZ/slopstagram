import path from "node:path";
import { test, expect } from "vitest";
import { resolveAppleCaptionsForReport } from "../sdk/apple-caption-report-service.ts";
import { AppleOcrUnavailableError } from "../sdk/lib/apple-ocr-service.ts";
import { fetchStoriesManifest } from "../sdk/stories.ts";
import {
  createCapturingLogger,
  createClient,
  fixedNow,
  noSleep,
  reel,
  storyItem,
  reelsResponse,
} from "./mock-helpers.ts";
import { createStoryFixtures } from "./test-database.ts";

test("reads cached local previews and stops after the first unavailable result", async (context) => {
  const { storyRepository, storyStorage } = createStoryFixtures(context);
  const logger = createCapturingLogger();
  const client = createClient(
    [{ id: "r1", media_ids: ["m1", "m2"], user: { username: "one" } }],
    [reelsResponse({ r1: reel("r1", [storyItem("m1"), storyItem("m2")]) })],
  );
  const report = await fetchStoriesManifest(client, {
    logger,
    now: fixedNow,
    sleep: noSleep,
    storyRepository,
    storyStorage,
  });
  const resolvedPaths: Array<string> = [];

  await resolveAppleCaptionsForReport(
    report,
    {
      profilePicPathByUrl: new Map(),
      storyPreviewPathByUrl: new Map([
        ["https://example.com/m1.jpg", "images/story-previews/m1.jpg"],
        ["https://example.com/m2.jpg", "images/story-previews/m2.jpg"],
      ]),
    },
    {
      logger,
      cacheDirectory: "/cache",
      resolver: (_mediaPk, imagePath) => {
        resolvedPaths.push(imagePath);
        throw new AppleOcrUnavailableError("Vision is unavailable");
      },
    },
  );

  expect(resolvedPaths).toStrictEqual([path.resolve("/cache/images/story-previews/m1.jpg")]);
  expect(
    logger.messages.some((message) =>
      message.includes(
        "warn: apple ocr unavailable; skipping remaining captions: Vision is unavailable",
      ),
    ),
  ).toBeTruthy();
});

test("resolves local OCR without embedding it in the report", async (context) => {
  const { storyRepository, storyStorage } = createStoryFixtures(context);
  const logger = createCapturingLogger();
  const client = createClient(
    [{ id: "r1", media_ids: ["m1"], user: { username: "one" } }],
    [reelsResponse({ r1: reel("r1", [storyItem("m1")]) })],
  );
  const report = await fetchStoriesManifest(client, {
    logger,
    now: fixedNow,
    sleep: noSleep,
    storyRepository,
    storyStorage,
  });

  await resolveAppleCaptionsForReport(
    report,
    {
      profilePicPathByUrl: new Map(),
      storyPreviewPathByUrl: new Map([
        ["https://example.com/m1.jpg", "images/story-previews/m1.jpg"],
      ]),
    },
    {
      logger,
      cacheDirectory: "/cache",
      resolver: async (mediaPk, imagePath) => {
        expect(mediaPk).toBe("m1");
        expect(imagePath).toBe(path.resolve("/cache/images/story-previews/m1.jpg"));
        return "local OCR text";
      },
    },
  );
  expect("apple_caption" in report.output.users[0].stories[0]).toBe(false);
});
