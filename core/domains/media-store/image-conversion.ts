import sharp from "sharp";

export async function convertImageToJpeg(image: Buffer): Promise<Buffer> {
  return await sharp(image).jpeg().toBuffer();
}
