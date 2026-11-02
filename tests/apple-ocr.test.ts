import { Buffer } from "node:buffer";
import { describe, test, expect } from "vitest";
import { recognizeAppleCaption } from "@@/core/vision/apple-ocr.ts";
import { createTestRuntime } from "./setup/test-runtime.ts";

describe("recognizeAppleCaption", () => {
  test("uses stored OCR by media key", async (context) => {
    let runCount = 0;
    const runtime = await createTestRuntime(context, {
      runAppleOcr: async () => {
        runCount += 1;
        return "fresh caption";
      },
    });
    await runtime.appleVision.save("story-1", "stored caption");

    const caption = await recognizeAppleCaption(runtime, "story-1", "/cache/story-1.jpg", {
      readImage: async () => {
        throw new Error("should not read");
      },
    });

    expect(caption).toBe("stored caption");
    expect(runCount).toBe(0);
  });

  test("stores OCR result when the repository has no entry", async (context) => {
    let receivedImage: Uint8Array | undefined;
    const runtime = await createTestRuntime(context, {
      runAppleOcr: async (image) => {
        receivedImage = image;
        return "fresh caption";
      },
    });

    const caption = await recognizeAppleCaption(runtime, "story-2", "/cache/story-2.jpg", {
      readImage: async () => Buffer.from("local-image"),
    });

    expect(caption).toBe("fresh caption");
    expect(receivedImage).toStrictEqual(Buffer.from("local-image"));
    expect(runtime.appleVision.findByMediaPk("story-2")).toBe("fresh caption");
  });

  test("normalizes OCR text before storing it", async (context) => {
    const runtime = await createTestRuntime(context, {
      runAppleOcr: async () => "\r\n  fresh caption  \n",
    });

    const caption = await recognizeAppleCaption(runtime, "story-3", "/cache/story-3.jpg", {
      readImage: async () => Buffer.from("local-image"),
    });

    expect(caption).toBe("fresh caption");
    expect(runtime.appleVision.findByMediaPk("story-3")).toBe("fresh caption");
  });

  test("reports OCR as unavailable without loading it on Windows", async (context) => {
    const runtime = await createTestRuntime(context, { runAppleOcr: undefined });

    await expect(
      recognizeAppleCaption(runtime, "story-4", "/cache/story-4.jpg", {
        platform: "win32",
        readImage: async () => Buffer.from("local-image"),
      }),
    ).rejects.toMatchObject({ kind: "unavailable", message: "unsupported platform win32" });
  });
});
