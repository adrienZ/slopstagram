import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { createConsola } from "consola";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { createCacheStorages } from "../scripts/lib/cache-service.ts";
import type { CachedReportImages } from "../scripts/lib/image-cache-service.ts";
import {
  VISION_SERVER_NOT_RUNNING,
  resolveVisionForReport,
} from "../scripts/lib/vision-service.ts";
import type { Logger } from "../scripts/lib/logging-service.ts";
import type { StoriesManifestReport } from "../scripts/lib/types.ts";

const previewSource = "https://example.com/story-preview.webp";

function createMockLogger(): Logger {
  const logger = createConsola();

  logger.mockTypes(() => {
    const log = () => {};
    log.raw = log;

    return log;
  });

  return Object.assign(logger, {
    progress: () => {},
  });
}

function createReport(source: string = previewSource): StoriesManifestReport {
  return {
    failures: [],
    manifest: {
      users: [],
    },
    metadata: {
      broadcasts_count: 0,
      counts: {
        cache_hits: 0,
        cache_misses: 0,
        failed: 0,
        fetched: 0,
        reels: 0,
        stories: 1,
      },
      created_at: "2026-07-26T09:48:26.773Z",
      report_name: "stories-report.json",
      status: "ok",
      story_ranking_token: null,
    },
    output: {
      users: [
        {
          full_name: "Vision User",
          profile_pic_url: null,
          reel_ids: ["r1"],
          stories: [
            {
              apple_caption: "apple text",
              ig_caption: "ig text",
              locations: [],
              media_pk: "story-pk",
              preview_image_url: source,
              stickers: [],
              status: "ok",
            },
          ],
          username: "visionuser",
        },
      ],
    },
  };
}

async function withReportImage<T>(
  run: (reportDirectory: string, cachedImages: CachedReportImages) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(path.join(tmpdir(), "slopstagram-vision-test-"));
  const imagePath = path.join(directory, "story.jpg");

  try {
    await writeFile(imagePath, Buffer.from("jpeg-bytes"));
    return await run(directory, {
      profilePicPathByUrl: new Map(),
      storyPreviewPathByUrl: new Map([[previewSource, "story.jpg"]]),
    });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

describe("resolveVisionForReport", () => {
  test("caches successful vision responses", async () => {
    const { visionStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    let fetchCount = 0;

    await withReportImage(async (reportDirectory, cachedImages) => {
      const fetchVision = async (_url: string | URL | Request, init?: RequestInit) => {
        fetchCount += 1;
        // oxlint-disable-next-line typescript/no-base-to-string
        const body = JSON.parse(String(init?.body)) as {
          format?: unknown;
          images: string[];
          prompt?: string;
        };
        assert.equal(body.images.length, 1);
        assert.equal(Buffer.from(body.images[0] ?? "", "base64").toString(), "jpeg-bytes");
        assert.match(
          String(body.prompt),
          /Provide a list of all visible text\. Only if there is text\./,
        );
        assert.match(String(body.prompt), /ignore all texts/i);
        const schema = body.format as {
          additionalProperties?: unknown;
          properties?: Record<string, { description?: string; type?: string }>;
          required?: string[];
          type?: string;
        };
        assert.equal(schema.type, "object");
        assert.equal(schema.additionalProperties, false);
        assert.deepEqual(schema.required, ["ocrText", "description"]);
        assert.equal(schema.properties?.ocrText?.type, "array");
        assert.match(schema.properties?.ocrText?.description ?? "", /Exact all OCR texts/);
        assert.equal(schema.properties?.description?.type, "string");
        assert.match(schema.properties?.description?.description ?? "", /image description/);

        return new Response(
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
      };

      const first = await resolveVisionForReport(createReport(), cachedImages, {
        fetchVision,
        logger: createMockLogger(),
        reportDirectory,
        storage: visionStorage,
      });
      const second = await resolveVisionForReport(createReport(), cachedImages, {
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
      const cacheEntry = await visionStorage.getItem(cacheKeys[0]!);
      assert.equal("prompt" in (cacheEntry ?? {}), false);
      assert.equal(typeof cacheEntry?.prompt_hash, "string");
      assert.equal(fetchCount, 1);
    });
  });

  test("reuses cached responses for the same story when the signed CDN URL changes", async () => {
    const { visionStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    const firstPreviewSource = "https://example.com/story-preview.webp?signature=old";
    const secondPreviewSource = "https://example.com/story-preview.webp?signature=new";
    let fetchCount = 0;

    const directory = await mkdtemp(path.join(tmpdir(), "slopstagram-vision-test-"));
    const imagePath = path.join(directory, "story.jpg");

    try {
      await writeFile(imagePath, Buffer.from("jpeg-bytes"));
      const cachedImages: CachedReportImages = {
        profilePicPathByUrl: new Map(),
        storyPreviewPathByUrl: new Map([
          [firstPreviewSource, "story.jpg"],
          [secondPreviewSource, "story.jpg"],
        ]),
      };
      const fetchVision = async () => {
        fetchCount += 1;

        return new Response(
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
      };

      const first = await resolveVisionForReport(createReport(firstPreviewSource), cachedImages, {
        fetchVision,
        logger: createMockLogger(),
        reportDirectory: directory,
        storage: visionStorage,
      });
      const second = await resolveVisionForReport(createReport(secondPreviewSource), cachedImages, {
        fetchVision,
        logger: createMockLogger(),
        reportDirectory: directory,
        storage: visionStorage,
      });

      assert.deepEqual(first.get(firstPreviewSource), {
        text: "same text",
        visual: "same story",
      });
      assert.deepEqual(second.get(secondPreviewSource), {
        text: "same text",
        visual: "same story",
      });
      assert.equal(fetchCount, 1);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("returns server-down text when vision is unavailable", async () => {
    const { visionStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );

    await withReportImage(async (reportDirectory, cachedImages) => {
      const result = await resolveVisionForReport(createReport(), cachedImages, {
        fetchVision: async () => {
          throw new TypeError("fetch failed");
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
    const { visionStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );

    await withReportImage(async (reportDirectory, cachedImages) => {
      const result = await resolveVisionForReport(createReport(), cachedImages, {
        fetchVision: async () =>
          new Response(
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
    const { visionStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );

    await withReportImage(async (reportDirectory, cachedImages) => {
      const result = await resolveVisionForReport(createReport(), cachedImages, {
        fetchVision: async () =>
          new Response(
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
    const { visionStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );

    await withReportImage(async (reportDirectory, cachedImages) => {
      const result = await resolveVisionForReport(createReport(), cachedImages, {
        fetchVision: async () =>
          new Response(JSON.stringify({ error: "bad request" }), {
            headers: { "content-type": "application/json" },
            status: 400,
          }),
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
