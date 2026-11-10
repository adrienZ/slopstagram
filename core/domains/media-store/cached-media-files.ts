import { createHash } from "node:crypto";
import { media, type MediaFile } from "./media-urls.ts";

function digest(name: string): string {
  return createHash("sha256").update(name).digest("hex");
}

/** The audio file the media store keeps for a music asset or a story soundtrack, by its id. */
export function cachedAudioFile(id: string, extension: string): MediaFile {
  return media.audio.file(`${digest(`${id}:audio`)}.${extension}`);
}

/** The artwork file the media store keeps for a music asset, by its id. */
export function cachedArtworkFile(id: string): MediaFile {
  return media.image.file(`music/${digest(`${id}:artwork`)}.jpg`);
}
