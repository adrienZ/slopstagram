import { createHash } from "node:crypto";
import path from "node:path";
import {
  BASE_CACHE_DIR,
  getImageCacheMetadataKey,
  IMAGES_STORAGE_DIR,
  imageCacheStorage,
} from "./cache-service.ts";
import type { Logger } from "./logging-service.ts";
import { noopLogger } from "./logging-service.ts";
import type {
  ImageCacheStorage,
  StoriesManifestReport,
} from "./types.ts";

type FetchResponse = {
  arrayBuffer: () => Promise<ArrayBuffer>;
  headers: {
    get: (name: string) => string | null;
  };
  ok: boolean;
  status: number;
};

type FetchImage = (url: string) => Promise<FetchResponse>;

export type CacheReportImagesOptions = {
  fetchImage?: FetchImage;
  logger?: Logger;
  reportDirectory?: string;
  storage?: ImageCacheStorage;
};

export type CachedReportImages = {
  profilePicPathByUrl: Map<string, string>;
  storyPreviewPathByUrl: Map<string, string>;
};

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function getImageHash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function getExtensionFromUrl(source: string): string | null {
  try {
    const extension = path
      .extname(new URL(source).pathname)
      .toLowerCase()
      .slice(1);
    return extension || null;
  } catch {
    return null;
  }
}

function getImageExtension(source: string, contentType: string | null): string {
  const normalizedContentType = contentType?.split(";")[0]?.trim().toLowerCase();
  return (
    (normalizedContentType ? CONTENT_TYPE_EXTENSIONS[normalizedContentType] : null) ??
    getExtensionFromUrl(source) ??
    "jpg"
  );
}

function getRelativeReportImagePath(
  reportDirectory: string,
  imagePath: string,
): string {
  return path
    .relative(reportDirectory, path.resolve(BASE_CACHE_DIR, imagePath))
    .split(path.sep)
    .join("/");
}

function isPresent(value: string | null): value is string {
  return Boolean(value);
}

async function cacheImage(
  source: string,
  namespace: string,
  options: Required<
    Pick<
      CacheReportImagesOptions,
      "fetchImage" | "logger" | "reportDirectory" | "storage"
    >
  >,
): Promise<string | null> {
  const imageHash = getImageHash(source);
  const metadataKey = getImageCacheMetadataKey(`${namespace}/${imageHash}`);
  const cachedEntry = await options.storage.getItem(metadataKey);

  if (cachedEntry) {
    return getRelativeReportImagePath(options.reportDirectory, cachedEntry.path);
  }

  const response = await options.fetchImage(source);
  if (!response.ok) {
    options.logger.warn(`could not cache image ${source}: HTTP ${response.status}`);
    return null;
  }

  const contentType = response.headers.get("content-type");
  const extension = getImageExtension(source, contentType);
  const rawKey = `${namespace}/${imageHash}.${extension}`;
  const imagePath = `${IMAGES_STORAGE_DIR}/${rawKey}`;
  const body = Buffer.from(await response.arrayBuffer());

  await options.storage.setItemRaw(rawKey, body);
  await options.storage.setItem(metadataKey, {
    content_type: contentType,
    path: imagePath,
    source,
  });

  return getRelativeReportImagePath(options.reportDirectory, imagePath);
}

export async function cacheReportImages(
  report: StoriesManifestReport,
  options: CacheReportImagesOptions = {},
): Promise<CachedReportImages> {
  const fetchImage = options.fetchImage ?? fetch;
  const logger = options.logger ?? noopLogger;
  const reportDirectory =
    options.reportDirectory ?? path.resolve(BASE_CACHE_DIR, "reports");
  const storage = options.storage ?? imageCacheStorage;
  const profilePicPathByUrl = new Map<string, string>();
  const storyPreviewPathByUrl = new Map<string, string>();

  const profilePicUrls = report.output.users
    .map((user) => user.profile_pic_url)
    .filter(isPresent);

  for (const source of new Set(profilePicUrls)) {
    try {
      const cachedPath = await cacheImage(source, "avatars", {
        fetchImage,
        logger,
        reportDirectory,
        storage,
      });

      if (cachedPath) {
        profilePicPathByUrl.set(source, cachedPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`could not cache image ${source}: ${message}`);
    }
  }

  const storyPreviewUrls = report.output.users
    .flatMap((user) => user.stories.map((story) => story.preview_image_url))
    .filter(isPresent);

  for (const source of new Set(storyPreviewUrls)) {
    try {
      const cachedPath = await cacheImage(source, "story-previews", {
        fetchImage,
        logger,
        reportDirectory,
        storage,
      });

      if (cachedPath) {
        storyPreviewPathByUrl.set(source, cachedPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`could not cache image ${source}: ${message}`);
    }
  }

  return {
    profilePicPathByUrl,
    storyPreviewPathByUrl,
  };
}
