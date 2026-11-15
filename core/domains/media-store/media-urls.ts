import { cachedMediaContentType } from "./media-types.ts";

/** The folders of the media store. Defined here, not in `cache-storage.ts`, because the browser loads this file. */
export const IMAGES_STORAGE_DIR = "images";
export const AUDIO_STORAGE_DIR = "audio";

export interface MediaFile {
  store: typeof AUDIO_STORAGE_DIR | typeof IMAGES_STORAGE_DIR;
  key: string;
  storedPath: string;
  url: string;
}

function extensionOf(key: string): string {
  const dot = key.lastIndexOf(".");
  return dot === -1 ? "" : key.slice(dot).toLowerCase();
}

function createStore(
  store: MediaFile["store"],
  urlPrefix: string,
  accepts: (key: string) => boolean,
) {
  function file(key: string): MediaFile {
    return { store, key, storedPath: `${store}/${key}`, url: `${urlPrefix}${key}` };
  }
  function fromKey(key: string): MediaFile | null {
    return accepts(key) ? file(key) : null;
  }
  /** The file a stored path (`<store>/<key>`, as the database keeps it) stands for, if any. */
  function fromStoredPath(storedPath: string | null): MediaFile | null {
    return storedPath?.startsWith(`${store}/`) === true
      ? fromKey(storedPath.slice(store.length + 1))
      : null;
  }
  return { file, fromKey, fromStoredPath };
}

const images = createStore(IMAGES_STORAGE_DIR, "/media/", (key) => extensionOf(key) === ".jpg");
const audio = createStore(
  AUDIO_STORAGE_DIR,
  "/media/audio/",
  (key) => cachedMediaContentType(extensionOf(key))?.startsWith("audio/") === true,
);

function decode(requestPath: string): string | null {
  try {
    return decodeURIComponent(requestPath);
  } catch {
    return null;
  }
}

export const media = {
  image: {
    avatar: (pk: string) => images.file(`avatars/${pk}.jpg`),
    storyPreview: (mediaPk: string) => images.file(`story-previews/${mediaPk}.jpg`),
    /** Music artwork, at a key of the image store (without its `images/` prefix). */
    artwork: (key: string | null) =>
      key?.startsWith("music/") === true ? images.fromKey(key) : null,
    file: images.file,
    fromStoredPath: images.fromStoredPath,
  },
  audio: {
    file: audio.file,
    fromStoredPath: audio.fromStoredPath,
  },

  /** Traversal fails closed here, whatever the storage driver does with a `..` key. */
  fromRequest(requestPath: string): MediaFile | null {
    const key = decode(requestPath);
    if (key === null || key.includes("..")) {
      return null;
    }
    const audioPrefix = `${AUDIO_STORAGE_DIR}/`;
    return key.startsWith(audioPrefix)
      ? audio.fromKey(key.slice(audioPrefix.length))
      : images.fromKey(key);
  },
};
