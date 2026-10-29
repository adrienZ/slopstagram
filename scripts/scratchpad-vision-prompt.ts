import { Buffer } from "node:buffer";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { z } from "zod";
import { getOllamaClient } from "../sdk/ollama.ts";
import {
  VISION_MODEL,
  // VISION_PROMPT,
} from "../sdk/lib/vision-analysis-service.ts";

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

const DEFAULT_IMAGE_URL = "https://cdn.example.test/fixture-image-1.jpg";

function getArgValue(args: Array<string>, flag: string): string | undefined {
  const index = args.indexOf(flag);

  return index === -1 ? undefined : args[index + 1];
}

async function downloadImage(url: string): Promise<string> {
  const response = await globalThis.fetch(url);

  if (!response.ok) {
    throw new Error(`image fetch failed: HTTP ${response.status}`);
  }

  const body = Buffer.from(await response.arrayBuffer());
  const imagePath = path.join(tmpdir(), `slopstagram-vision-${Date.now()}.jpg`);

  await writeFile(imagePath, body);

  return imagePath;
}

function parseResponse(value: string): z.output<typeof z.json> {
  try {
    return z.json().parse(JSON.parse(value));
  } catch {
    return value;
  }
}

function writeOutput(value: string): void {
  process.stdout.write(`${value}\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const imageUrl = DEFAULT_IMAGE_URL;
  const host = getArgValue(args, "--host");
  const model = getArgValue(args, "--model") ?? VISION_MODEL;
  const prompt = getArgValue(args, "--prompt") ?? VISION_PROMPT;
  const imagePath = await downloadImage(imageUrl);
  const client = getOllamaClient({ host });

  writeOutput(JSON.stringify({ imagePath, model, prompt }, null, 2));

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
  const responseText = response.response ?? "";

  writeOutput("\nraw response:");
  writeOutput(responseText);
  writeOutput("\nparsed response:");
  const parsedResponse = parseResponse(responseText);
  writeOutput(JSON.stringify(parsedResponse, null, 2));

  writeOutput("\nvalidation:");
  const validation = VisionResponseSchema.safeParse(parsedResponse);
  if (validation.success) {
    writeOutput(JSON.stringify({ ok: true, data: validation.data }, null, 2));
  } else {
    writeOutput(JSON.stringify({ ok: false, issues: validation.error.issues }, null, 2));
  }
}

try {
  await main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
