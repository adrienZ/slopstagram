import { createHash } from "node:crypto";
import { media, type MediaFile } from "./media-urls.ts";

function digest(name: string): string {
  return createHash("sha256").update(name).digest("hex");
}

export function cachedAudioFile(id: string, extension: string): MediaFile {
  return media.audio.file(`${digest(`${id}:audio`)}.${extension}`);
}

export function cachedArtworkFile(id: string): MediaFile {
  return media.image.file(`music/${digest(`${id}:artwork`)}.jpg`);
}
