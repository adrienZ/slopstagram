import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { Ollama } from "ollama";
import { z } from "zod";
import {
  VISION_MODEL,
  // VISION_PROMPT,
} from "./lib/vision-service.ts";

const VISION_PROMPT = `
    Describe the image in detail.
    First, extract any text that appears in the image. Provide a list of all visible text. Only if there is text.
    Then, provide a short description of the visual elements of the image. ignore all texts.
    \`\`\`json
  `;

const VisionResponseSchema = z
  .object({
    ocrText: z
      .array(z.string())
      .describe("Exact all OCR texts if any. Do not include any non-text image description."),
    description: z
      .string()
      .describe(
        "Required. image description. Do not mention, text, quote, summarize, or translate any visible words, letters, captions, signs, labels, or phrases.",
      ),
  })
  .strict();

const VISION_OUTPUT_SCHEMA = z.toJSONSchema(VisionResponseSchema);

const DEFAULT_IMAGE_URL =
  "https://instagram.fcdg4-1.fna.fbcdn.net/v/t51.71878-15/763318529_1727223928519145_8475697476003986394_n.jpg?stp=dst-jpg_e15_tt6&_nc_cat=102&ig_cache_key=Mzk1NTY1OTI1NjcwNzQ1NTE5OA%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IlNUT1JZLnhwaWRzLjY0MC5zZHIudmlkZW9fZGVmYXVsdF9jb3Zlcl9mcmFtZS5DMyJ9&_nc_ohc=KjQLP_pdY30Q7kNvwHsawbR&_nc_oc=AdoZFdOpUbVynr9CMW1E3_cu60C4zVkBZulvtFJKpQLJfzi-Y38uPLBCIjkPD3POulxhHhEbBLnk2WtOtelRLsZp&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=instagram.fcdg4-1.fna&_nc_gid=PydYgYJLiJxslfTj51yKAA&_nc_ss=7a22e&oh=00_AQH7QdTWzi4zpM4PEfe87Of1oI8aXX6PqzoVq_fAw0vryg&oe=6A76F60F";

// oxlint-disable-next-line no-unused-vars
const DEFAULT_IMAGE2_URL =
  "https://instagram.fcdg4-1.fna.fbcdn.net/v/t51.71878-15/763417317_2600086243765944_7952138478558910062_n.jpg?stp=dst-jpg_e15_tt6&_nc_cat=107&ig_cache_key=Mzk1NTUwNDc4NDkwMzgyNzA4Mg%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6IlNUT1JZLnhwaWRzLjY0MC5zZHIudmlkZW9fZGVmYXVsdF9jb3Zlcl9mcmFtZS5DMyJ9&_nc_ohc=LqIm4zuXr4oQ7kNvwFX3hAy&_nc_oc=Adr6YbVIX3xF-kF4Ylq51QwMIkUfT5NAn7xAzmfU-RaPpQ2gSLMbXbgz2Y2XmwDlQJl8Ertm_fg-f1yruxxeFbJv&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=instagram.fcdg4-1.fna&_nc_gid=PydYgYJLiJxslfTj51yKAA&_nc_ss=7a22e&oh=00_AQFG2_SfH3hfnHOV6Vb2AHPlD8cDX0nI8pfT6rttQ8XK7Q&oe=6A76F5E1";

function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);

  return index === -1 ? undefined : args[index + 1];
}

async function downloadImage(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`image fetch failed: HTTP ${response.status}`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  const imagePath = path.join(tmpdir(), `slopstagram-vision-${Date.now()}.jpg`);

  await writeFile(imagePath, body);

  return imagePath;
}

function parseResponse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const imageUrl = DEFAULT_IMAGE_URL;
  const host = getArgValue(args, "--host") ?? "http://127.0.0.1:11434";
  const model = getArgValue(args, "--model") ?? VISION_MODEL;
  const prompt = getArgValue(args, "--prompt") ?? VISION_PROMPT;
  const imagePath = await downloadImage(imageUrl);
  const client = new Ollama({ host });

  console.log(JSON.stringify({ imagePath, model, prompt }, null, 2));

  const response = await client.generate({
    format: {
      ...VISION_OUTPUT_SCHEMA,
      additionalProperties: false,
    },
    images: [imagePath],
    model,
    options: {
      temperature: 0.1,
    },
    prompt,
    stream: false,
  });

  console.log("\nraw response:");
  console.log(response.response);
  console.log("\nparsed response:");
  const parsedResponse = parseResponse(response.response);
  console.log(JSON.stringify(parsedResponse, null, 2));

  console.log("\nvalidation:");
  const validation = VisionResponseSchema.safeParse(parsedResponse);
  if (validation.success) {
    console.log(JSON.stringify({ ok: true, data: validation.data }, null, 2));
  } else {
    console.log(JSON.stringify({ ok: false, issues: validation.error.issues }, null, 2));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
