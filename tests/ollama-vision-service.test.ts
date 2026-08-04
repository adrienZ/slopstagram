import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { createStorage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { createCacheStorages } from "../scripts/lib/cache-service.ts";
import type { CachedReportImages } from "../scripts/lib/image-cache-service.ts";
import {
  OLLAMA_SERVER_NOT_RUNNING,
  resolveOllamaVisionForReport,
} from "../scripts/lib/ollama-vision-service.ts";
import type { StoriesManifestReport } from "../scripts/lib/types.ts";

const previewSource = "https://example.com/story-preview.webp";

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
              media_pk: "story-pk",
              preview_image_url: source,
              stickers: [],
              status: "cached",
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
  const directory = await mkdtemp(path.join(tmpdir(), "slopstagram-ollama-test-"));
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

describe("resolveOllamaVisionForReport", () => {
  test("caches successful ollama responses", async () => {
    const { ollamaVisionStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    let fetchCount = 0;

    await withReportImage(async (reportDirectory, cachedImages) => {
      const fetchOllama = async (_url: string | URL | Request, init?: RequestInit) => {
        fetchCount += 1;
        const body = JSON.parse(String(init?.body)) as { images: string[] };
        assert.equal(body.images.length, 1);
        assert.equal(Buffer.from(body.images[0] ?? "", "base64").toString(), "jpeg-bytes");

        return new Response(JSON.stringify({ response: "  cat | text\nline  " }), {
          status: 200,
        });
      };

      const first = await resolveOllamaVisionForReport(createReport(), cachedImages, {
        fetchOllama,
        reportDirectory,
        storage: ollamaVisionStorage,
      });
      const second = await resolveOllamaVisionForReport(createReport(), cachedImages, {
        fetchOllama,
        reportDirectory,
        storage: ollamaVisionStorage,
      });

      assert.equal(first.get(previewSource), "cat | text\nline");
      assert.equal(second.get(previewSource), "cat | text\nline");
      assert.equal(fetchCount, 1);
    });
  });

  test("reuses cached responses for the same story when the signed CDN URL changes", async () => {
    const { ollamaVisionStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );
    const firstPreviewSource = "https://example.com/story-preview.webp?signature=old";
    const secondPreviewSource = "https://example.com/story-preview.webp?signature=new";
    let fetchCount = 0;

    const directory = await mkdtemp(path.join(tmpdir(), "slopstagram-ollama-test-"));
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
      const fetchOllama = async () => {
        fetchCount += 1;

        return new Response(JSON.stringify({ response: "same story" }), {
          status: 200,
        });
      };

      const first = await resolveOllamaVisionForReport(
        createReport(firstPreviewSource),
        cachedImages,
        {
          fetchOllama,
          reportDirectory: directory,
          storage: ollamaVisionStorage,
        },
      );
      const second = await resolveOllamaVisionForReport(
        createReport(secondPreviewSource),
        cachedImages,
        {
          fetchOllama,
          reportDirectory: directory,
          storage: ollamaVisionStorage,
        },
      );

      assert.equal(first.get(firstPreviewSource), "same story");
      assert.equal(second.get(secondPreviewSource), "same story");
      assert.equal(fetchCount, 1);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("returns server-down text when ollama is unavailable", async () => {
    const { ollamaVisionStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );

    await withReportImage(async (reportDirectory, cachedImages) => {
      const result = await resolveOllamaVisionForReport(createReport(), cachedImages, {
        fetchOllama: async () => {
          throw new TypeError("fetch failed");
        },
        reportDirectory,
        storage: ollamaVisionStorage,
      });

      assert.equal(result.get(previewSource), OLLAMA_SERVER_NOT_RUNNING);
    });
  });

  test("returns short per-image text for non-server failures", async () => {
    const { ollamaVisionStorage } = createCacheStorages(
      createStorage({
        driver: memoryDriver(),
      }),
    );

    await withReportImage(async (reportDirectory, cachedImages) => {
      const result = await resolveOllamaVisionForReport(createReport(), cachedImages, {
        fetchOllama: async () =>
          new Response(JSON.stringify({ error: "bad request" }), {
            headers: { "content-type": "application/json" },
            status: 400,
          }),
        reportDirectory,
        storage: ollamaVisionStorage,
      });

      assert.equal(result.get(previewSource), "ollama vision failed: HTTP 400");
    });
  });
});
