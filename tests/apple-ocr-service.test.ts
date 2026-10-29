import { Buffer } from "node:buffer";
import { describe, test, expect } from "vitest";
import { recognizeAppleCaption } from "../sdk/lib/apple-ocr-service.ts";
import { createAppleVisionRepositoryAdapter } from "./repository-adapters.ts";

describe("recognizeAppleCaption", () => {
  test("uses stored OCR by media key", async () => {
    const repository = createAppleVisionRepositoryAdapter();
    repository.entries.set("story-1", "stored caption");

    let runCount = 0;
    const caption = await recognizeAppleCaption("story-1", "/cache/story-1.jpg", {
      readImage: async () => {
        throw new Error("should not read");
      },
      runAppleOcr: async () => {
        runCount += 1;
        return "fresh caption";
      },
      repository,
    });

    expect(caption).toBe("stored caption");
    expect(runCount).toBe(0);
  });

  test("stores OCR result when the repository has no entry", async () => {
    const repository = createAppleVisionRepositoryAdapter();
    let receivedImage: Uint8Array | undefined;

    const caption = await recognizeAppleCaption("story-2", "/cache/story-2.jpg", {
      readImage: async () => Buffer.from("local-image"),
      runAppleOcr: async (image) => {
        receivedImage = image;
        return "fresh caption";
      },
      repository,
    });

    expect(caption).toBe("fresh caption");
    expect(receivedImage).toStrictEqual(Buffer.from("local-image"));
    expect(repository.entries.get("story-2")).toBe("fresh caption");
  });

  test("normalizes OCR text before storing it", async () => {
    const repository = createAppleVisionRepositoryAdapter();

    const caption = await recognizeAppleCaption("story-3", "/cache/story-3.jpg", {
      readImage: async () => Buffer.from("local-image"),
      runAppleOcr: async () => "\r\n  fresh caption  \n",
      repository,
    });

    expect(caption).toBe("fresh caption");
    expect(repository.entries.get("story-3")).toBe("fresh caption");
  });

  test("reports OCR as unavailable without loading it on Windows", async () => {
    const repository = createAppleVisionRepositoryAdapter();

    await expect(
      recognizeAppleCaption("story-4", "/cache/story-4.jpg", {
        platform: "win32",
        readImage: async () => Buffer.from("local-image"),
        repository,
      }),
    ).rejects.toMatchObject({ kind: "unavailable", message: "unsupported platform win32" });
  });
});
