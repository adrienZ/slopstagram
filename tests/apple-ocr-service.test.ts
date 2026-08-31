import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { recognizeAppleCaption } from "../sdk/lib/apple-ocr-service.ts";
import { createAppleVisionRepositoryAdapter } from "./repository-adapters.ts";

describe("recognizeAppleCaption", () => {
  test("uses stored OCR by media key", async () => {
    const repository = createAppleVisionRepositoryAdapter();
    repository.entries.set("story-1", "stored caption");

    let runCount = 0;
    const caption = await recognizeAppleCaption("story-1", "/cache/story-1.jpg", {
      readImage: () => Promise.reject(new Error("should not read")),
      runAppleOcr: () => {
        runCount += 1;
        return Promise.resolve("fresh caption");
      },
      repository: repository,
    });

    assert.equal(caption, "stored caption");
    assert.equal(runCount, 0);
  });

  test("stores OCR result when the repository has no entry", async () => {
    const repository = createAppleVisionRepositoryAdapter();
    let receivedImage: Uint8Array | undefined;

    const caption = await recognizeAppleCaption("story-2", "/cache/story-2.jpg", {
      readImage: () => Promise.resolve(Buffer.from("local-image")),
      runAppleOcr: (image) => {
        receivedImage = image;
        return Promise.resolve("fresh caption");
      },
      repository: repository,
    });

    assert.equal(caption, "fresh caption");
    assert.deepEqual(receivedImage, Buffer.from("local-image"));
    assert.equal(repository.entries.get("story-2"), "fresh caption");
  });

  test("normalizes OCR text before storing it", async () => {
    const repository = createAppleVisionRepositoryAdapter();

    const caption = await recognizeAppleCaption("story-3", "/cache/story-3.jpg", {
      readImage: () => Promise.resolve(Buffer.from("local-image")),
      runAppleOcr: () => Promise.resolve("\r\n  fresh caption  \n"),
      repository: repository,
    });

    assert.equal(caption, "fresh caption");
    assert.equal(repository.entries.get("story-3"), "fresh caption");
  });

  test("reports OCR as unavailable without loading it on Windows", async () => {
    const repository = createAppleVisionRepositoryAdapter();

    await assert.rejects(
      recognizeAppleCaption("story-4", "/cache/story-4.jpg", {
        platform: "win32",
        readImage: () => Promise.resolve(Buffer.from("local-image")),
        repository: repository,
      }),
      (error) =>
        error instanceof Error &&
        "kind" in error &&
        error.kind === "unavailable" &&
        error.message === "unsupported platform win32",
    );
  });
});
