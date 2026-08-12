import sharp from "sharp";

export function convertImageToJpeg(image: Buffer): Promise<Buffer> {
  return sharp(image).jpeg().toBuffer();
}
