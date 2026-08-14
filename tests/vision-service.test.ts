import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { describe, test } from "bun:test";
import { z } from "zod";
import { VISION_SERVER_NOT_RUNNING } from "../sdk/lib/vision-analysis-service.ts";
import { resolveVisionForReport } from "../sdk/lib/vision-report-service.ts";
import {
  createMemoryCacheStorages,
  createMockLogger,
  createVisionReport,
  previewSource,
  withReportImage,
} from "./mock-helpers.ts";

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
  prompt: z.string().optional(),
});

describe("resolveVisionForReport", () => {
  test("caches successful vision responses", async () => {
    const { visionStorage } = createMemoryCacheStorages();
    let fetchCount = 0;

    await withReportImage(async (reportDirectory, cachedImages) => {
      const fetchVision = (_url: string | URL | Request, init?: RequestInit) => {
        fetchCount += 1;
        // oxlint-disable-next-line typescript/no-base-to-string
        const body = VisionRequestBodySchema.parse(JSON.parse(String(init?.body)));
        const { images } = body;

        assert.equal(images.length, 1);
        assert.equal(Buffer.from(images[0] ?? "", "base64").toString(), "jpeg-bytes");
        assert.match(
          String(body.prompt),
          /Provide a list of all visible text\. Only if there is text\./u,
        );
        assert.match(String(body.prompt), /ignore all texts/iu);
        const { format: schema } = body;
        const ocrText = schema.properties.ocrText;
        const description = schema.properties.description;
        assert.equal(schema.type, "object");
        assert.equal(schema.additionalProperties, false);
        assert.deepEqual(schema.required?.toSorted(), ["description", "ocrText"]);
        assert.equal(ocrText.type, "array");
        assert.match(ocrText.description ?? "", /Exact all OCR texts/u);
        assert.equal(description.type, "string");
        assert.match(description.description ?? "", /image description/u);

        return Promise.resolve(
          new globalThis.Response(
            JSON.stringify({
              response: JSON.stringify({
                description: "  cat on a counter\nwith a cup  ",
                ocrText: ["  readable text  "],
              }),
            }),
            {
              status: 200,
            },
          ),
        );
      };

      const first = await resolveVisionForReport(createVisionReport(), cachedImages, {
        fetchVision,
        logger: createMockLogger(),
        reportDirectory,
        storage: visionStorage,
      });
      const second = await resolveVisionForReport(createVisionReport(), cachedImages, {
        fetchVision,
        logger: createMockLogger(),
        reportDirectory,
        storage: visionStorage,
      });

      assert.deepEqual(first.get(previewSource), {
        text: "readable text",
        visual: "cat on a counter\nwith a cup",
      });
      assert.deepEqual(second.get(previewSource), {
        text: "readable text",
        visual: "cat on a counter\nwith a cup",
      });
      const cacheKeys = await visionStorage.getKeys();
      assert.equal(cacheKeys.length, 1);
      const cacheEntry = await visionStorage.getItem(cacheKeys[0]);
      assert.equal("prompt" in (cacheEntry ?? {}), false);
      assert.equal(typeof cacheEntry?.prompt_hash, "string");
      assert.equal(fetchCount, 1);
    });
  });

  test("reuses cached responses for the same story when the signed CDN URL changes", async () => {
    const { visionStorage } = createMemoryCacheStorages();
    const firstPreviewSource = "https://example.com/story-preview.webp?signature=old";
    const secondPreviewSource = "https://example.com/story-preview.webp?signature=new";
    let fetchCount = 0;

    await withReportImage(
      async (reportDirectory, cachedImages) => {
        const fetchVision = () => {
          fetchCount += 1;

          return Promise.resolve(
            new globalThis.Response(
              JSON.stringify({
                response: JSON.stringify({
                  description: "same story",
                  ocrText: ["same text"],
                }),
              }),
              {
                status: 200,
              },
            ),
          );
        };

        const first = await resolveVisionForReport(
          createVisionReport(firstPreviewSource),
          cachedImages,
          {
            fetchVision,
            logger: createMockLogger(),
            reportDirectory,
            storage: visionStorage,
          },
        );
        const second = await resolveVisionForReport(
          createVisionReport(secondPreviewSource),
          cachedImages,
          {
            fetchVision,
            logger: createMockLogger(),
            reportDirectory,
            storage: visionStorage,
          },
        );

        assert.deepEqual(first.get(firstPreviewSource), {
          text: "same text",
          visual: "same story",
        });
        assert.deepEqual(second.get(secondPreviewSource), {
          text: "same text",
          visual: "same story",
        });
        assert.equal(fetchCount, 1);
      },
      new Map([
        [firstPreviewSource, "story.jpg"],
        [secondPreviewSource, "story.jpg"],
      ]),
    );
  });

  test("returns server-down text when vision is unavailable", async () => {
    const { visionStorage } = createMemoryCacheStorages();

    await withReportImage(async (reportDirectory, cachedImages) => {
      const result = await resolveVisionForReport(createVisionReport(), cachedImages, {
        fetchVision: () => {
          return Promise.reject(new TypeError("fetch failed"));
        },
        logger: createMockLogger(),
        reportDirectory,
        storage: visionStorage,
      });

      assert.deepEqual(result.get(previewSource), {
        text: "",
        visual: VISION_SERVER_NOT_RUNNING,
      });
    });
  });

  test("normalizes missing OCR text to an empty string", async () => {
    const { visionStorage } = createMemoryCacheStorages();

    await withReportImage(async (reportDirectory, cachedImages) => {
      const result = await resolveVisionForReport(createVisionReport(), cachedImages, {
        fetchVision: () =>
          Promise.resolve(
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
          ),
        logger: createMockLogger(),
        reportDirectory,
        storage: visionStorage,
      });

      assert.deepEqual(result.get(previewSource), {
        text: "",
        visual: "A street gathering with bunting and people talking.",
      });
    });
  });

  test("joins multiple OCR text entries", async () => {
    const { visionStorage } = createMemoryCacheStorages();

    await withReportImage(async (reportDirectory, cachedImages) => {
      const result = await resolveVisionForReport(createVisionReport(), cachedImages, {
        fetchVision: () =>
          Promise.resolve(
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
          ),
        logger: createMockLogger(),
        reportDirectory,
        storage: visionStorage,
      });

      assert.deepEqual(result.get(previewSource), {
        text: "Oui\nÉvêque de nier",
        visual: "A stylized fantasy illustration on an old map background.",
      });
    });
  });

  test("returns short per-image text for non-server failures", async () => {
    const { visionStorage } = createMemoryCacheStorages();

    await withReportImage(async (reportDirectory, cachedImages) => {
      const result = await resolveVisionForReport(createVisionReport(), cachedImages, {
        fetchVision: () =>
          Promise.resolve(
            new globalThis.Response(JSON.stringify({ error: "bad request" }), {
              headers: { "content-type": "application/json" },
              status: 400,
            }),
          ),
        logger: createMockLogger(),
        reportDirectory,
        storage: visionStorage,
      });

      assert.deepEqual(result.get(previewSource), {
        text: "",
        visual: "vision failed: HTTP 400",
      });
    });
  });
});
