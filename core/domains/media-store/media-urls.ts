import { cachedMediaContentType } from "./media-types.ts";
import { AUDIO_STORAGE_DIR, IMAGES_STORAGE_DIR } from "./cache-storage.ts";

type StoreName = typeof AUDIO_STORAGE_DIR | typeof IMAGES_STORAGE_DIR;

/** The URL vocabulary of the media store: what each store serves, under which URL, and which files it accepts. */
const IMAGE_EXTENSION = ".jpg";
const STORES: Record<StoreName, { urlPrefix: string; accepts: (extension: string) => boolean }> = {
  [AUDIO_STORAGE_DIR]: {
    urlPrefix: "/media/audio/",
    accepts: (extension) =>
      extension !== IMAGE_EXTENSION && cachedMediaContentType(extension) !== undefined,
  },
  [IMAGES_STORAGE_DIR]: {
    urlPrefix: "/media/",
    accepts: (extension) => extension === IMAGE_EXTENSION,
  },
};
const STORE_NAMES: Array<StoreName> = [AUDIO_STORAGE_DIR, IMAGES_STORAGE_DIR];
const AVATARS_FOLDER = "avatars";
const STORY_PREVIEWS_FOLDER = "story-previews";

/** A file of the media store: its store, its key in that store, where the database keeps it and the URL serving it. */
export interface MediaFile {
  store: StoreName;
  key: string;
  storedPath: string;
  url: string;
}

function file(store: MediaFile["store"], key: string): MediaFile {
  return { store, key, storedPath: `${store}/${key}`, url: `${STORES[store].urlPrefix}${key}` };
}

function image(folder: string, id: string): MediaFile {
  return file(IMAGES_STORAGE_DIR, `${folder}/${id}${IMAGE_EXTENSION}`);
}

function decode(requestPath: string): string | null {
  try {
    return decodeURIComponent(requestPath);
  } catch {
    return null;
  }
}

export const media = {
  avatar: (pk: string) => image(AVATARS_FOLDER, pk),
  storyPreview: (mediaPk: string) => image(STORY_PREVIEWS_FOLDER, mediaPk),

  /** The file a stored path stands for, or null for a path outside the stores or without a key. */
  fromStoredPath(storedPath: string): MediaFile | null {
    const store = STORE_NAMES.find((candidate) => storedPath.startsWith(`${candidate}/`));
    const key = store === undefined ? "" : storedPath.slice(store.length + 1);
    return store !== undefined && key.length > 0 ? file(store, key) : null;
  },

  /**
   * The file a request path under `/media/` stands for (URL-encoded, without the prefix): a path
   * under `audio/` is an audio file, any other path is a `.jpg` of the image store. Null for a path
   * of another type or an undecodable one. The key is not confined to the store: whoever opens it
   * must keep it inside the store folder.
   */
  fromRequest(requestPath: string): MediaFile | null {
    const decoded = decode(requestPath);
    if (decoded === null) {
      return null;
    }
    const audioPrefix = `${AUDIO_STORAGE_DIR}/`;
    const isAudio = decoded.startsWith(audioPrefix);
    const store = isAudio ? AUDIO_STORAGE_DIR : IMAGES_STORAGE_DIR;
    const key = isAudio ? decoded.slice(audioPrefix.length) : decoded;
    const dot = key.lastIndexOf(".");
    return dot !== -1 && STORES[store].accepts(key.slice(dot).toLowerCase())
      ? file(store, key)
      : null;
  },
};
