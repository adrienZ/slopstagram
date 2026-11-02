const audioTypes = new Map([
  ["mp3", "audio/mpeg"],
  ["m4a", "audio/mp4"],
  ["aac", "audio/aac"],
  ["ogg", "audio/ogg"],
  ["webm", "audio/webm"],
  ["wav", "audio/wav"],
  ["flac", "audio/flac"],
]);

export function audioFileExtension(contentType: string): string | undefined {
  const normalized = contentType === "audio/x-wav" ? "audio/wav" : contentType;
  return [...audioTypes].find(([, type]) => type === normalized)?.[0];
}

export function cachedMediaContentType(extension: string): string | undefined {
  return extension === ".jpg" ? "image/jpeg" : audioTypes.get(extension.slice(1));
}
