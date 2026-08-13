import assert from "node:assert/strict";
import path from "node:path";
import { test } from "bun:test";
import { MacOcrError } from "mac-ocr";
import { resolveAppleCaptionsForReport } from "../sdk/apple-caption-report-service.ts";
import { fetchStoriesManifest } from "../sdk/stories.ts";
import {
  createCapturingLogger,
  createClient,
  createMemoryCacheStorages,
  fixedNow,
  noSleep,
  reel,
  response,
  storyItem,
} from "./mock-helpers.ts";

test("reads cached local previews and stops after the first unavailable result", async () => {
  const { storiesStorage } = createMemoryCacheStorages();
  const logger = createCapturingLogger();
  const client = createClient(
    [{ id: "r1", media_ids: ["m1", "m2"], user: { username: "one" } }],
    [response({ reels: { r1: reel("r1", [storyItem("m1"), storyItem("m2")]) } })],
  );
  const report = await fetchStoriesManifest(client, {
    logger,
    now: fixedNow,
    sleep: noSleep,
    storyStorage: storiesStorage,
  });
  const resolvedPaths: string[] = [];

  await resolveAppleCaptionsForReport(
    report,
    {
      profilePicPathByUrl: new Map(),
      storyPreviewPathByUrl: new Map([
        ["https://example.com/m1.jpg", "../images/story-previews/m1.jpg"],
        ["https://example.com/m2.jpg", "../images/story-previews/m2.jpg"],
      ]),
    },
    {
      logger,
      reportDirectory: "/cache/reports",
      resolver: (_mediaPk, imagePath) => {
        resolvedPaths.push(imagePath);
        throw new MacOcrError("Vision is unavailable", {
          kind: "unavailable",
        });
      },
    },
  );

  assert.deepEqual(resolvedPaths, [path.resolve("/cache/images/story-previews/m1.jpg")]);
  assert.equal(report.manifest.users[0]?.stories[0]?.apple_caption, "N/A");
  assert.equal(report.manifest.users[0]?.stories[1]?.apple_caption, "N/A");
  assert.ok(
    logger.messages.some((message) =>
      message.includes(
        "warn: apple ocr unavailable; skipping remaining captions: Vision is unavailable",
      ),
    ),
  );
});

test("writes local OCR captions to both report views", async () => {
  const { storiesStorage } = createMemoryCacheStorages();
  const logger = createCapturingLogger();
  const client = createClient(
    [{ id: "r1", media_ids: ["m1"], user: { username: "one" } }],
    [response({ reels: { r1: reel("r1", [storyItem("m1")]) } })],
  );
  const report = await fetchStoriesManifest(client, {
    logger,
    now: fixedNow,
    sleep: noSleep,
    storyStorage: storiesStorage,
  });

  await resolveAppleCaptionsForReport(
    report,
    {
      profilePicPathByUrl: new Map(),
      storyPreviewPathByUrl: new Map([
        ["https://example.com/m1.jpg", "../images/story-previews/m1.jpg"],
      ]),
    },
    {
      logger,
      reportDirectory: "/cache/reports",
      resolver: (mediaPk, imagePath) => {
        assert.equal(mediaPk, "m1");
        assert.equal(imagePath, path.resolve("/cache/images/story-previews/m1.jpg"));
        return Promise.resolve("local OCR text");
      },
    },
  );

  assert.equal(report.manifest.users[0]?.stories[0]?.apple_caption, "local OCR text");
  assert.equal(report.output.users[0]?.stories[0]?.apple_caption, "local OCR text");
});
