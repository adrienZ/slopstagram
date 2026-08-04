import assert from "node:assert/strict";
import { describe, test } from "node:test";
import sharp from "sharp";
import { convertImageToJpeg } from "../scripts/lib/image-conversion-service.ts";

describe("convertImageToJpeg", () => {
  test("converts a PNG buffer to a JPEG buffer", async () => {
    const png = await sharp({
      create: {
        background: { r: 255, g: 0, b: 0 },
        channels: 3,
        height: 2,
        width: 2,
      },
    })
      .png()
      .toBuffer();

    const jpeg = await convertImageToJpeg(png);
    const metadata = await sharp(jpeg).metadata();

    assert.equal(metadata.format, "jpeg");
  });

  test("rejects invalid image bytes", async () => {
    await assert.rejects(() => convertImageToJpeg(Buffer.from("not an image")));
  });
});
