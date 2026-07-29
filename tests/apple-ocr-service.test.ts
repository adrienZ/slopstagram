import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import {
  createCacheStorages,
  getAppleCaptionCacheKey,
} from "../scripts/lib/cache-service.ts";
import { recognizeAppleCaption } from "../scripts/lib/apple-ocr-service.ts";
import type { StoryItem } from "../scripts/lib/types.ts";

function createStory(
  pk: string,
  url: string | null,
): StoryItem {
  return {
    image_versions2: url
      ? {
          candidates: [
            {
              height: 100,
              url,
              width: 100,
            },
          ],
        }
      : undefined,
    media_type: 1,
    pk,
  };
}

describe("recognizeAppleCaption", () => {
  test("uses cached OCR when source is unchanged", async () => {
    const { appleCaptionsStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    await appleCaptionsStorage.setItem(getAppleCaptionCacheKey("story-1"), {
      caption: "cached caption",
      source: "https://example.com/story-1.jpg",
    });

    let runCount = 0;
    const caption = await recognizeAppleCaption(
      createStory("story-1", "https://example.com/story-1.jpg"),
      {
        runAppleOcr: async () => {
          runCount += 1;
          return "fresh caption";
        },
        storage: appleCaptionsStorage,
      },
    );

    assert.equal(caption, "cached caption");
    assert.equal(runCount, 0);
  });

  test("stores OCR result when cache is missing", async () => {
    const { appleCaptionsStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );

    const caption = await recognizeAppleCaption(
      createStory("story-2", "https://example.com/story-2.jpg"),
      {
        runAppleOcr: async () => "fresh caption",
        storage: appleCaptionsStorage,
      },
    );

    assert.equal(caption, "fresh caption");
    assert.deepEqual(
      await appleCaptionsStorage.getItem(getAppleCaptionCacheKey("story-2")),
      {
        caption: "fresh caption",
        source: "https://example.com/story-2.jpg",
      },
    );
  });
});
