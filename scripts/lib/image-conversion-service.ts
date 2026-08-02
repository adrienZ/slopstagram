import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export type ConvertImageToJpeg = (
  image: Buffer,
  sourceExtension: string,
) => Promise<Buffer>;

// Uses macOS `sips`; this conversion path is macOS-only.
export async function convertImageToJpeg(
  image: Buffer,
  sourceExtension: string,
): Promise<Buffer> {
  const directory = await mkdtemp(path.join(tmpdir(), "slopstagram-image-"));
  const inputPath = path.join(directory, `input.${sourceExtension || "img"}`);
  const outputPath = path.join(directory, "output.jpg");

  try {
    await writeFile(inputPath, image);

    await new Promise<void>((resolve, reject) => {
      const child = spawn("sips", [
        "-s",
        "format",
        "jpeg",
        inputPath,
        "--out",
        outputPath,
      ]);
      let stderr = "";

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(stderr.trim() || `sips exited with code ${code ?? "unknown"}`));
      });
    });

    return await readFile(outputPath);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
