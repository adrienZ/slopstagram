import { Buffer } from "node:buffer";
import { describe, test, vi, expect } from "vitest";
import { z } from "zod";
import {
  VISION_MAX_OUTPUT_TOKENS,
  VISION_REPEAT_PENALTY,
  VISION_SERVER_NOT_RUNNING,
} from "@@/core/vision/vision-analysis.ts";
import { resolveVisionForReport } from "@@/core/vision/vision-report.ts";
import { createVisionReport, previewSource } from "./mock-helpers.ts";
import { createTestRuntime } from "./setup/test-runtime.ts";

const VisionJsonSchemaPropertySchema = z.object({
  description: z.string().optional(),
  type: z.string().optional(),
});
const VisionRequestBodySchema = z.object({
  format: z.object({
    additionalProperties: z.unknown().optional(),
    properties: z.object({
      description: VisionJsonSchemaPropertySchema,
      ocrText: VisionJsonSchemaPropertySchema,
    }),
    required: z.array(z.string()).optional(),
    type: z.string().optional(),
  }),
  images: z.array(z.string()),
  options: z.object({ num_predict: z.number(), repeat_penalty: z.number() }),
  prompt: z.string().optional(),
});

async function cachePreview(
  runtime: Awaited<ReturnType<typeof createTestRuntime>>,
  sources: Array<string> = [previewSource],
) {
  await runtime.storage.images.setItemRaw("story.jpg", Buffer.from("jpeg-bytes"));
  return {
    profilePicPathByUrl: new Map<string, string>(),
    storyPreviewPathByUrl: new Map(sources.map((source) => [source, "images/story.jpg"])),
  };
}

function requestBodyToString(body: BodyInit | null | undefined): string {
  return z.string().parse(body);
}

describe("resolveVisionForReport", () => {
  for (const entry of [
    { name: "missing", cachedPath: undefined, warning: "no cached preview" },
    { name: "empty", cachedPath: "", warning: "no cached preview" },
    { name: "non-JPEG", cachedPath: "images/story.webp", warning: "preview is not JPEG" },
    { name: "unstored", cachedPath: "images/gone.jpg", warning: "cached preview is missing" },
  ]) {
    test(`skips ${entry.name} cached previews without contacting vision`, async (context) => {
      let fetchCount = 0;
      const runtime = await createTestRuntime(context, {
        fetchOllama: async () => {
          fetchCount += 1;
          throw new Error("vision must not be called for invalid previews");
        },
      });
      const paths = new Map<string, string>();
      if (entry.cachedPath !== undefined) {
        paths.set(previewSource, entry.cachedPath);
      }
      const result = await resolveVisionForReport(runtime, createVisionReport(), {
        profilePicPathByUrl: new Map(),
        storyPreviewPathByUrl: paths,
      });

      expect(result.get(previewSource)).toStrictEqual({
        text: "",
        visual: `vision failed: ${entry.warning}`,
      });
      expect(fetchCount).toBe(0);
      expect(runtime.vision.findByMediaPk("story-pk")).toBeNull();
    });
  }

  test("uses OLLAMA_HOST and reuses successful vision responses from the repository", async (context) => {
    vi.stubEnv("OLLAMA_HOST", "http://vision.example:11434/api/generate/");
    let fetchCount = 0;

    async function fetchOllama(url: string | URL | Request, init?: RequestInit) {
      expect(url).toBe("http://vision.example:11434/api/generate");
      fetchCount += 1;
      const body = VisionRequestBodySchema.parse(JSON.parse(requestBodyToString(init?.body)));
      const { images } = body;

      expect(images.length).toBe(1);
      expect(body.options.num_predict).toBe(VISION_MAX_OUTPUT_TOKENS);
      expect(body.options.repeat_penalty).toBe(VISION_REPEAT_PENALTY);
      expect(Buffer.from(images[0] ?? "", "base64").toString()).toBe("jpeg-bytes");
      expect(String(body.prompt)).toMatch(
        /Provide a list of all visible text\. Only if there is text\./u,
      );
      expect(String(body.prompt)).toMatch(/ignore all texts/iu);
      const { format: schema } = body;
      const { ocrText, description } = schema.properties;
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required?.toSorted()).toStrictEqual(["description", "ocrText"]);
      expect(ocrText.type).toBe("array");
      expect(ocrText.description ?? "").toMatch(/Exact all OCR texts/u);
      expect(description.type).toBe("string");
      expect(description.description ?? "").toMatch(/image description/u);

      return new globalThis.Response(
        JSON.stringify({
          response: JSON.stringify({
            description: "  cat on a counter\nwith a cup  ",
            ocrText: ["  readable text  "],
          }),
        }),
        {
          status: 200,
        },
      );
    }

    const runtime = await createTestRuntime(context, { fetchOllama });
    const cachedImages = await cachePreview(runtime);

    const first = await resolveVisionForReport(runtime, createVisionReport(), cachedImages);
    const second = await resolveVisionForReport(runtime, createVisionReport(), cachedImages);

    expect(first.get(previewSource)).toStrictEqual({
      text: "readable text",
      visual: "cat on a counter\nwith a cup",
    });
    expect(second.get(previewSource)).toStrictEqual({
      text: "readable text",
      visual: "cat on a counter\nwith a cup",
    });
    const entry = runtime.vision.findByMediaPk("story-pk");
    expect(entry).not.toBeNull();
    expect("prompt" in (entry ?? {})).toBe(false);
    expect(entry?.prompt_hash.length).toBe(64);
    expect(fetchCount).toBe(1);
  });

  test("reuses stored responses for the same story when the signed CDN URL changes", async (context) => {
    const firstPreviewSource = "https://example.com/story-preview.webp?signature=old";
    const secondPreviewSource = "https://example.com/story-preview.webp?signature=new";
    let fetchCount = 0;

    async function fetchOllama() {
      fetchCount += 1;

      return new globalThis.Response(
        JSON.stringify({
          response: JSON.stringify({
            description: "same story",
            ocrText: ["same text"],
          }),
        }),
        {
          status: 200,
        },
      );
    }

    const runtime = await createTestRuntime(context, { fetchOllama });
    const cachedImages = await cachePreview(runtime, [firstPreviewSource, secondPreviewSource]);

    const first = await resolveVisionForReport(
      runtime,
      createVisionReport(firstPreviewSource),
      cachedImages,
    );
    const second = await resolveVisionForReport(
      runtime,
      createVisionReport(secondPreviewSource),
      cachedImages,
    );

    expect(first.get(firstPreviewSource)).toStrictEqual({
      text: "same text",
      visual: "same story",
    });
    expect(second.get(secondPreviewSource)).toStrictEqual({
      text: "same text",
      visual: "same story",
    });
    expect(fetchCount).toBe(1);
  });

  test("returns a stored response without reading the cached preview", async (context) => {
    let fetchCount = 0;
    const runtime = await createTestRuntime(context, {
      fetchOllama: async () => {
        fetchCount += 1;
        return globalThis.Response.json({
          response: JSON.stringify({ description: "stored scene", ocrText: [] }),
        });
      },
    });
    const cachedImages = await cachePreview(runtime);
    await resolveVisionForReport(runtime, createVisionReport(), cachedImages);
    await runtime.storage.images.removeItem("story.jpg");

    const result = await resolveVisionForReport(runtime, createVisionReport(), cachedImages);

    expect(result.get(previewSource)).toStrictEqual({ text: "", visual: "stored scene" });
    expect(fetchCount).toBe(1);
  });

  test("returns server-down text when vision is unavailable", async (context) => {
    const runtime = await createTestRuntime(context, {
      fetchOllama: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const cachedImages = await cachePreview(runtime);
    const result = await resolveVisionForReport(runtime, createVisionReport(), cachedImages);

    expect(result.get(previewSource)).toStrictEqual({
      text: "",
      visual: VISION_SERVER_NOT_RUNNING,
    });
  });

  test("normalizes missing OCR text to an empty string", async (context) => {
    const runtime = await createTestRuntime(context, {
      fetchOllama: async () =>
        new globalThis.Response(
          JSON.stringify({
            response: JSON.stringify({
              description: "A street gathering with bunting and people talking.",
              ocrText: [],
            }),
          }),
          {
            status: 200,
          },
        ),
    });
    const cachedImages = await cachePreview(runtime);
    const result = await resolveVisionForReport(runtime, createVisionReport(), cachedImages);

    expect(result.get(previewSource)).toStrictEqual({
      text: "",
      visual: "A street gathering with bunting and people talking.",
    });
  });

  test("joins multiple OCR text entries", async (context) => {
    const runtime = await createTestRuntime(context, {
      fetchOllama: async () =>
        new globalThis.Response(
          JSON.stringify({
            response: JSON.stringify({
              description: "A stylized fantasy illustration on an old map background.",
              ocrText: ["Oui", "Évêque de nier"],
            }),
          }),
          {
            status: 200,
          },
        ),
    });
    const cachedImages = await cachePreview(runtime);
    const result = await resolveVisionForReport(runtime, createVisionReport(), cachedImages);

    expect(result.get(previewSource)).toStrictEqual({
      text: "Oui\nÉvêque de nier",
      visual: "A stylized fantasy illustration on an old map background.",
    });
  });

  test("treats a missing Ollama response as an empty vision result", async (context) => {
    const runtime = await createTestRuntime(context, {
      fetchOllama: async () => globalThis.Response.json({ done: true }),
    });
    const cachedImages = await cachePreview(runtime);
    const result = await resolveVisionForReport(runtime, createVisionReport(), cachedImages);

    expect(result.get(previewSource)).toStrictEqual({ text: "", visual: "" });
  });

  test("returns short per-image text for non-server failures", async (context) => {
    const runtime = await createTestRuntime(context, {
      fetchOllama: async () =>
        new globalThis.Response(JSON.stringify({ error: "bad request" }), {
          headers: { "content-type": "application/json" },
          status: 400,
        }),
    });
    const cachedImages = await cachePreview(runtime);
    const result = await resolveVisionForReport(runtime, createVisionReport(), cachedImages);

    expect(result.get(previewSource)).toStrictEqual({
      text: "",
      visual: "vision failed: HTTP 400",
    });
  });
});
