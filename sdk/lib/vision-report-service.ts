import path from "node:path";
import { Ollama as VisionSdk } from "ollama";
import type { VisionRepository } from "../entities/vision.ts";
import { visionRepository } from "./entity-repository-service.ts";
import type { CachedReportImages } from "./image-cache-service.ts";
import type { Logger } from "./logging-service.ts";
import type { StoriesManifestReport, VisionResult } from "./types.ts";
import {
  analyzeImage,
  createFailureResult,
  VISION_MODEL,
  VISION_PROMPT,
} from "./vision-analysis-service.ts";

type VisionFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type VisionOptions = {
  cacheDirectory: string;
  endpoint?: string;
  fetchVision?: VisionFetch;
  logger: Logger;
  model?: string;
  prompt?: string;
  repository?: Pick<VisionRepository, "findByMediaPk" | "save">;
};

type PreviewEntry = {
  mediaPk: string;
  source: string;
};

type PreviewEntrySet = {
  sourcesByMediaPk: Map<string, string[]>;
  uniquePreviewEntries: PreviewEntry[];
};

type ResolvePreviewEntryOptions = {
  cachedImages: CachedReportImages;
  client: Pick<VisionSdk, "generate">;
  entry: PreviewEntry;
  index: number;
  logger: Logger;
  model: string;
  prompt: string;
  cacheDirectory: string;
  resultByPreviewUrl: Map<string, VisionResult>;
  sourcesByMediaPk: Map<string, string[]>;
  repository: Pick<VisionRepository, "findByMediaPk" | "save">;
  total: number;
};

type PreviewValidation =
  | { cachedPath: string; itemLabel: string; ok: true }
  | { itemLabel: string; message: string; ok: false; warning: string };

function resolveVisionHost(endpoint: string | undefined): string {
  return (endpoint ?? "http://127.0.0.1:11434").replace(/\/api\/generate\/?$/u, "");
}

function resolveCachedImagePath(cacheDirectory: string, imagePath: string): string {
  return path.isAbsolute(imagePath) ? imagePath : path.resolve(cacheDirectory, imagePath);
}

function getPreviewEntries(report: StoriesManifestReport): PreviewEntry[] {
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
  const sourcesByMediaPk = new Map<string, string[]>();

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
  sourcesByMediaPk: Map<string, string[]>,
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
  sourcesByMediaPk: Map<string, string[]>;
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
    resolveCachedImagePath(options.cacheDirectory, preview.cachedPath),
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
  report: StoriesManifestReport,
  cachedImages: CachedReportImages,
  options: VisionOptions,
): Promise<Map<string, VisionResult>> {
  const host = resolveVisionHost(options.endpoint);
  const client = new VisionSdk({
    fetch: options.fetchVision,
    host,
  });
  const logger = options.logger;
  const entrySet = createPreviewEntrySet(report);
  const resultByPreviewUrl = new Map<string, VisionResult>();

  for (const [index, entry] of entrySet.uniquePreviewEntries.entries()) {
    await resolvePreviewEntry({
      cachedImages,
      client,
      entry,
      index,
      logger,
      model: options.model ?? VISION_MODEL,
      prompt: options.prompt ?? VISION_PROMPT,
      cacheDirectory: options.cacheDirectory,
      resultByPreviewUrl,
      sourcesByMediaPk: entrySet.sourcesByMediaPk,
      repository: options.repository ?? visionRepository,
      total: entrySet.uniquePreviewEntries.length,
    });
  }

  return resultByPreviewUrl;
}
