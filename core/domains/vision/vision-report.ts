import path from "node:path";
import type { Ollama as VisionSdk } from "ollama";
import { getOllamaClient } from "@@/core/domains/vision/ollama.ts";
import type { VisionRepository } from "@@/core/domains/database/repositories/vision-repository.ts";
import type { ImageCacheStorage } from "@@/core/domains/media-store/cache-storage.ts";
import {
  readCachedImage,
  type CachedReportImages,
} from "@@/core/domains/media-store/image-cache.ts";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import type { Logger } from "@@/core/utils/logging.ts";
import type { StoriesManifestReport } from "@@/core/domains/fetch-run/report-types.ts";
import type { VisionResult } from "@@/core/domains/database/entities/vision.ts";
import {
  analyzeImage,
  createFailureResult,
  VISION_MODEL,
  VISION_PROMPT,
} from "@@/core/domains/vision/vision-analysis.ts";

interface VisionOptions {
  endpoint?: string;
  model?: string;
  prompt?: string;
}

interface PreviewEntry {
  mediaPk: string;
  source: string;
}

interface PreviewEntrySet {
  sourcesByMediaPk: Map<string, Array<string>>;
  uniquePreviewEntries: Array<PreviewEntry>;
}

interface ResolvePreviewEntryOptions {
  cachedImages: CachedReportImages;
  client: Pick<VisionSdk, "generate">;
  entry: PreviewEntry;
  index: number;
  logger: Logger;
  model: string;
  prompt: string;
  images: ImageCacheStorage;
  resultByPreviewUrl: Map<string, VisionResult>;
  sourcesByMediaPk: Map<string, Array<string>>;
  repository: Pick<VisionRepository, "findByMediaPk" | "save">;
  total: number;
}

type PreviewValidation =
  | { cachedPath: string; itemLabel: string; ok: true }
  | { itemLabel: string; message: string; ok: false; warning: string };

function getPreviewEntries(report: StoriesManifestReport): Array<PreviewEntry> {
  return report.output.users
    .flatMap((user) =>
      user.stories.map((story) => ({
        mediaPk: story.media_pk,
        source: story.preview_image_url?.trim() ?? null,
      })),
    )
    .filter((entry): entry is PreviewEntry => Boolean(entry.source));
}

function createPreviewEntrySet(report: StoriesManifestReport): PreviewEntrySet {
  const entriesByMediaPk = new Map<string, PreviewEntry>();
  const sourcesByMediaPk = new Map<string, Array<string>>();

  for (const entry of getPreviewEntries(report)) {
    entriesByMediaPk.set(entry.mediaPk, entry);
    sourcesByMediaPk.set(entry.mediaPk, [
      ...(sourcesByMediaPk.get(entry.mediaPk) ?? []),
      entry.source,
    ]);
  }

  return {
    sourcesByMediaPk,
    uniquePreviewEntries: [...entriesByMediaPk.values()],
  };
}

function setResultForPreviewSources(
  resultByPreviewUrl: Map<string, VisionResult>,
  sourcesByMediaPk: Map<string, Array<string>>,
  entry: PreviewEntry,
  result: VisionResult,
): void {
  for (const previewSource of sourcesByMediaPk.get(entry.mediaPk) ?? [entry.source]) {
    resultByPreviewUrl.set(previewSource, result);
  }
}

function skipPreviewEntry(options: {
  entry: PreviewEntry;
  index: number;
  itemLabel: string;
  logger: Logger;
  message: string;
  resultByPreviewUrl: Map<string, VisionResult>;
  sourcesByMediaPk: Map<string, Array<string>>;
  total: number;
  warning: string;
}): void {
  options.logger.progress(options.index, options.total, {
    prefix: "vision",
    suffix: `${options.message} ${options.itemLabel}`,
  });
  options.logger.warn(`vision skipped for ${options.itemLabel}: ${options.warning}`);
  options.logger.progress(options.index + 1, options.total, {
    prefix: "vision",
    suffix: `skipped ${options.itemLabel}`,
  });
  setResultForPreviewSources(
    options.resultByPreviewUrl,
    options.sourcesByMediaPk,
    options.entry,
    createFailureResult(`vision failed: ${options.warning}`),
  );
}

function getPreviewValidation(options: ResolvePreviewEntryOptions): PreviewValidation {
  const cachedPath = options.cachedImages.storyPreviewPathByUrl.get(options.entry.source);
  const itemLabel = cachedPath ?? `vision/${options.entry.mediaPk}`;

  if (cachedPath === undefined || cachedPath.length === 0) {
    return { itemLabel, message: "missing", ok: false, warning: "no cached preview" };
  }

  if (path.extname(cachedPath).toLowerCase() !== ".jpg") {
    return { itemLabel, message: "checking", ok: false, warning: "preview is not JPEG" };
  }

  return { cachedPath, itemLabel, ok: true };
}

async function resolvePreviewEntry(options: ResolvePreviewEntryOptions): Promise<void> {
  const preview = getPreviewValidation(options);

  if (!preview.ok) {
    skipPreviewEntry({ ...options, ...preview });
    return;
  }

  options.logger.progress(options.index, options.total, {
    prefix: "vision",
    suffix: `resolving ${preview.itemLabel}`,
  });
  const result = await analyzeImage(
    preview.itemLabel,
    async () => {
      const image = await readCachedImage(options.images, preview.cachedPath);
      if (image === null) {
        throw new Error("cached preview is missing");
      }
      return image;
    },
    {
      client: options.client,
      logger: options.logger,
      mediaPk: options.entry.mediaPk,
      model: options.model,
      prompt: options.prompt,
      repository: options.repository,
    },
  );
  setResultForPreviewSources(
    options.resultByPreviewUrl,
    options.sourcesByMediaPk,
    options.entry,
    result,
  );
}

export async function resolveVisionForReport(
  runtime: Pick<Runtime, "fetchOllama" | "logger" | "storage"> & {
    vision: Pick<VisionRepository, "findByMediaPk" | "save">;
  },
  report: StoriesManifestReport,
  cachedImages: CachedReportImages,
  options: VisionOptions = {},
): Promise<Map<string, VisionResult>> {
  const client = getOllamaClient({
    fetch: runtime.fetchOllama,
    host: options.endpoint,
  });
  const { logger } = runtime;
  const entrySet = createPreviewEntrySet(report);
  const resultByPreviewUrl = new Map<string, VisionResult>();

  for (const [index, entry] of entrySet.uniquePreviewEntries.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- Vision analysis runs serially to bound local model resource use and preserve progress.
    await resolvePreviewEntry({
      cachedImages,
      client,
      entry,
      index,
      logger,
      model: options.model ?? VISION_MODEL,
      prompt: options.prompt ?? VISION_PROMPT,
      images: runtime.storage.images,
      resultByPreviewUrl,
      sourcesByMediaPk: entrySet.sourcesByMediaPk,
      repository: runtime.vision,
      total: entrySet.uniquePreviewEntries.length,
    });
  }

  return resultByPreviewUrl;
}
