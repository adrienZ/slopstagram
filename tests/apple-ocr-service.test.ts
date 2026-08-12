import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createCacheStorages, getMediaCacheKey } from "../sdk/lib/cache-service.ts";
import { recognizeAppleCaption } from "../sdk/lib/apple-ocr-service.ts";
import type { StoryItem } from "../sdk/lib/types.ts";
import { createMemoryStorage } from "./memory-storage.ts";

function createStory(pk: string, url: string | null): StoryItem {
  return {
    image_versions2:
      url === null
        ? undefined
        : {
            candidates: [
              {
                height: 100,
                url,
                width: 100,
              },
            ],
          },
    media_type: 1,
    pk,
  };
}

describe("recognizeAppleCaption", () => {
  test("uses cached OCR by media key", async () => {
    const { appleCaptionsStorage } = createCacheStorages(createMemoryStorage());
    await appleCaptionsStorage.setItem(getMediaCacheKey("story-1"), "cached caption");

    let runCount = 0;
    const caption = await recognizeAppleCaption(
      createStory("story-1", "https://example.com/story-1.jpg"),
      {
        runAppleOcr: () => {
          runCount += 1;
          return Promise.resolve("fresh caption");
        },
        storage: appleCaptionsStorage,
      },
    );

    assert.equal(caption, "cached caption");
    assert.equal(runCount, 0);
  });

  test("stores OCR result when cache is missing", async () => {
    const { appleCaptionsStorage } = createCacheStorages(createMemoryStorage());

    const caption = await recognizeAppleCaption(
      createStory("story-2", "https://example.com/story-2.jpg"),
      {
        runAppleOcr: () => Promise.resolve("fresh caption"),
        storage: appleCaptionsStorage,
      },
    );

    assert.equal(caption, "fresh caption");
    assert.deepEqual(
      await appleCaptionsStorage.getItem(getMediaCacheKey("story-2")),
      "fresh caption",
    );
  });

  test("normalizes OCR text before caching it", async () => {
    const { appleCaptionsStorage } = createCacheStorages(createMemoryStorage());

    const caption = await recognizeAppleCaption(
      createStory("story-3", "https://example.com/story-3.jpg"),
      {
        runAppleOcr: () => Promise.resolve("\r\n  fresh caption  \n"),
        storage: appleCaptionsStorage,
      },
    );

    assert.equal(caption, "fresh caption");
    assert.deepEqual(
      await appleCaptionsStorage.getItem(getMediaCacheKey("story-3")),
      "fresh caption",
    );
  });
});
