import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import { createCacheStorages, getMediaCacheKey } from "../sdk/lib/cache-service.ts";
import { recognizeAppleCaption } from "../sdk/lib/apple-ocr-service.ts";
import { createMemoryStorage } from "./memory-storage.ts";

describe("recognizeAppleCaption", () => {
  test("uses cached OCR by media key", async () => {
    const { appleCaptionsStorage } = createCacheStorages(createMemoryStorage());
    await appleCaptionsStorage.setItem(getMediaCacheKey("story-1"), "cached caption");

    let runCount = 0;
    const caption = await recognizeAppleCaption("story-1", "/cache/story-1.jpg", {
      readImage: () => Promise.reject(new Error("should not read")),
      runAppleOcr: () => {
        runCount += 1;
        return Promise.resolve("fresh caption");
      },
      storage: appleCaptionsStorage,
    });

    assert.equal(caption, "cached caption");
    assert.equal(runCount, 0);
  });

  test("stores OCR result when cache is missing", async () => {
    const { appleCaptionsStorage } = createCacheStorages(createMemoryStorage());
    let receivedImage: Uint8Array | undefined;

    const caption = await recognizeAppleCaption("story-2", "/cache/story-2.jpg", {
      readImage: () => Promise.resolve(Buffer.from("local-image")),
      runAppleOcr: (image) => {
        receivedImage = image;
        return Promise.resolve("fresh caption");
      },
      storage: appleCaptionsStorage,
    });

    assert.equal(caption, "fresh caption");
    assert.deepEqual(receivedImage, Buffer.from("local-image"));
    assert.deepEqual(
      await appleCaptionsStorage.getItem(getMediaCacheKey("story-2")),
      "fresh caption",
    );
  });

  test("normalizes OCR text before caching it", async () => {
    const { appleCaptionsStorage } = createCacheStorages(createMemoryStorage());

    const caption = await recognizeAppleCaption("story-3", "/cache/story-3.jpg", {
      readImage: () => Promise.resolve(Buffer.from("local-image")),
      runAppleOcr: () => Promise.resolve("\r\n  fresh caption  \n"),
      storage: appleCaptionsStorage,
    });

    assert.equal(caption, "fresh caption");
    assert.deepEqual(
      await appleCaptionsStorage.getItem(getMediaCacheKey("story-3")),
      "fresh caption",
    );
  });

  test("reports OCR as unavailable without loading it on Windows", async () => {
    const { appleCaptionsStorage } = createCacheStorages(createMemoryStorage());

    await assert.rejects(
      recognizeAppleCaption("story-4", "/cache/story-4.jpg", {
        platform: "win32",
        readImage: () => Promise.resolve(Buffer.from("local-image")),
        storage: appleCaptionsStorage,
      }),
      (error: unknown) =>
        error instanceof Error &&
        "kind" in error &&
        error.kind === "unavailable" &&
        error.message === "unsupported platform win32",
    );
  });
});
