import { Buffer } from "node:buffer";
import { describe, test, expect } from "vitest";
import { recognizeAppleCaption } from "@@/core/domains/vision/apple-ocr.ts";
import { createTestRuntime } from "@@/tests/setup/test-runtime.ts";

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

    const caption = await recognizeAppleCaption(runtime, "story-1", "images/story-1.jpg");

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
    await runtime.storage.images.setItemRaw("story-2.jpg", Buffer.from("local-image"));

    const caption = await recognizeAppleCaption(runtime, "story-2", "images/story-2.jpg");

    expect(caption).toBe("fresh caption");
    expect(receivedImage).toStrictEqual(Buffer.from("local-image"));
    expect(runtime.appleVision.findByMediaPk("story-2")).toBe("fresh caption");
  });

  test("normalizes OCR text before storing it", async (context) => {
    const runtime = await createTestRuntime(context, {
      runAppleOcr: async () => "\r\n  fresh caption  \n",
    });
    await runtime.storage.images.setItemRaw("story-3.jpg", Buffer.from("local-image"));

    const caption = await recognizeAppleCaption(runtime, "story-3", "images/story-3.jpg");

    expect(caption).toBe("fresh caption");
    expect(runtime.appleVision.findByMediaPk("story-3")).toBe("fresh caption");
  });

  test("fails when the cached image is missing", async (context) => {
    const runtime = await createTestRuntime(context, { runAppleOcr: async () => "unused" });

    await expect(recognizeAppleCaption(runtime, "story-5", "images/story-5.jpg")).rejects.toThrow(
      "cached image images/story-5.jpg is missing",
    );
    expect(runtime.appleVision.findByMediaPk("story-5")).toBeNull();
  });

  test("reports OCR as unavailable without loading it on Windows", async (context) => {
    const runtime = await createTestRuntime(context, { runAppleOcr: undefined });
    await runtime.storage.images.setItemRaw("story-4.jpg", Buffer.from("local-image"));

    await expect(
      recognizeAppleCaption(runtime, "story-4", "images/story-4.jpg", { platform: "win32" }),
    ).rejects.toMatchObject({ kind: "unavailable", message: "unsupported platform win32" });
  });
});
