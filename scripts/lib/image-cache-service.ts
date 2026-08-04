import { createHash } from "node:crypto";
import path from "node:path";
import {
  BASE_CACHE_DIR,
  getImageCacheMetadataKey,
  IMAGES_STORAGE_DIR,
  imageCacheStorage,
} from "./cache-service.ts";
import { convertImageToJpeg } from "./image-conversion-service.ts";
import type { Logger } from "./logging-service.ts";
import { noopLogger } from "./logging-service.ts";
import type {
  ImageCacheEntry,
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
  convertToJpeg?: typeof convertImageToJpeg;
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

function getRawKeyFromImagePath(imagePath: string): string {
  const prefix = `${IMAGES_STORAGE_DIR}/`;
  return imagePath.startsWith(prefix) ? imagePath.slice(prefix.length) : imagePath;
}

function getJpegRawKey(namespace: string, imageKey: string): string {
  return `${namespace}/${imageKey}.jpg`;
}

function isStoryPreviewNamespace(namespace: string): boolean {
  return namespace === "story-previews";
}

async function getRawBuffer(
  storage: ImageCacheStorage,
  rawKey: string,
): Promise<Buffer | null> {
  const raw = await storage.getItemRaw(rawKey);

  if (raw === null || raw === undefined) {
    return null;
  }

  return Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
}

async function convertCachedStoryPreviewToJpeg(
  source: string,
  imageKey: string,
  metadataKey: string,
  cachedEntry: ImageCacheEntry,
  options: Required<
    Pick<
      CacheReportImagesOptions,
      "convertToJpeg" | "logger" | "reportDirectory" | "storage"
    >
  >,
): Promise<string | null> {
  const cachedRawKey = getRawKeyFromImagePath(cachedEntry.path);
  const cachedExtension = path.extname(cachedRawKey).toLowerCase().slice(1);

  if (cachedExtension === "jpg" || cachedExtension === "jpeg") {
    return getRelativeReportImagePath(options.reportDirectory, cachedEntry.path);
  }

  const cachedBody = await getRawBuffer(options.storage, cachedRawKey);
  if (!cachedBody) {
    return getRelativeReportImagePath(options.reportDirectory, cachedEntry.path);
  }

  try {
    const jpegBody = await options.convertToJpeg(cachedBody);
    const jpegRawKey = getJpegRawKey("story-previews", imageKey);
    const jpegPath = `${IMAGES_STORAGE_DIR}/${jpegRawKey}`;

    await options.storage.setItemRaw(jpegRawKey, jpegBody);
    await options.storage.setItem(metadataKey, {
      content_type: "image/jpeg",
      path: jpegPath,
    });

    return getRelativeReportImagePath(options.reportDirectory, jpegPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.logger.warn(`could not convert cached image ${source} to JPEG: ${message}`);
    return getRelativeReportImagePath(options.reportDirectory, cachedEntry.path);
  }
}

async function cacheImage(
  source: string,
  namespace: string,
  options: Required<
    Pick<
      CacheReportImagesOptions,
      "convertToJpeg" | "fetchImage" | "logger" | "reportDirectory" | "storage"
    >
  > & { mediaPk?: string },
): Promise<string | null> {
  const imageKey = options.mediaPk ?? getImageHash(source);
  const metadataKey = getImageCacheMetadataKey(`${namespace}/${imageKey}`);
  const cachedEntry = await options.storage.getItem(metadataKey);

  if (cachedEntry) {
    if (isStoryPreviewNamespace(namespace)) {
      return await convertCachedStoryPreviewToJpeg(
        source,
        imageKey,
        metadataKey,
        cachedEntry,
        options,
      );
    }

    return getRelativeReportImagePath(options.reportDirectory, cachedEntry.path);
  }

  const response = await options.fetchImage(source);
  if (!response.ok) {
    options.logger.warn(`could not cache image ${source}: HTTP ${response.status}`);
    return null;
  }

  const contentType = response.headers.get("content-type");
  const extension = getImageExtension(source, contentType);
  const body = Buffer.from(await response.arrayBuffer());
  const shouldConvertToJpeg = isStoryPreviewNamespace(namespace);
  let rawKey = `${namespace}/${imageKey}.${extension}`;
  let imagePath = `${IMAGES_STORAGE_DIR}/${rawKey}`;
  let contentTypeToStore = contentType;
  let bodyToStore: Buffer = body;

  if (shouldConvertToJpeg) {
    try {
      bodyToStore = await options.convertToJpeg(body);
      rawKey = getJpegRawKey(namespace, imageKey);
      imagePath = `${IMAGES_STORAGE_DIR}/${rawKey}`;
      contentTypeToStore = "image/jpeg";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.logger.warn(`could not convert image ${source} to JPEG: ${message}`);
    }
  }

  await options.storage.setItemRaw(rawKey, bodyToStore);
  await options.storage.setItem(metadataKey, {
    content_type: contentTypeToStore,
    path: imagePath,
  });

  return getRelativeReportImagePath(options.reportDirectory, imagePath);
}

export async function cacheReportImages(
  report: StoriesManifestReport,
  options: CacheReportImagesOptions = {},
): Promise<CachedReportImages> {
  const fetchImage = options.fetchImage ?? fetch;
  const convertToJpeg = options.convertToJpeg ?? convertImageToJpeg;
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
        convertToJpeg,
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

  const storyPreviewEntries = report.output.users
    .flatMap((user) =>
      user.stories.map((story) => ({
        mediaPk: story.media_pk,
        source: story.preview_image_url,
      })),
    )
    .filter(
      (entry): entry is { mediaPk: string; source: string } =>
        isPresent(entry.source),
    );

  const storyPreviewPathByMediaPk = new Map<string, string>();

  for (const { mediaPk, source } of new Map(
    storyPreviewEntries.map((entry) => [entry.mediaPk, entry]),
  ).values()) {
    try {
      const cachedPath = await cacheImage(source, "story-previews", {
        mediaPk,
        convertToJpeg,
        fetchImage,
        logger,
        reportDirectory,
        storage,
      });

      if (cachedPath) {
        storyPreviewPathByMediaPk.set(mediaPk, cachedPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`could not cache image ${source}: ${message}`);
    }
  }

  for (const { mediaPk, source } of storyPreviewEntries) {
    const cachedPath = storyPreviewPathByMediaPk.get(mediaPk);

    if (cachedPath) {
      storyPreviewPathByUrl.set(source, cachedPath);
    }
  }

  return {
    profilePicPathByUrl,
    storyPreviewPathByUrl,
  };
}
