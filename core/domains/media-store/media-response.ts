import path from "node:path";
import type { Runtime } from "@@/core/domains/runtime/runtime.ts";
import { readBytes } from "./cache-storage.ts";
import { cachedMediaContentType } from "./media-types.ts";
import { media } from "./media-urls.ts";

export type MediaRuntime = Pick<Runtime, "storage">;

function notFound(): Response {
  return new globalThis.Response("media not found", { status: 404 });
}

function byteRange(range: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(?<first>\d*)-(?<last>\d*)$/u.exec(range);
  if (!match?.groups || size === 0 || (match.groups.first === "" && match.groups.last === "")) {
    return null;
  }
  const suffix = match.groups.first === "";
  const start = suffix ? Math.max(0, size - Number(match.groups.last)) : Number(match.groups.first);
  const end =
    suffix || match.groups.last === "" ? size - 1 : Math.min(Number(match.groups.last), size - 1);
  return Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    start <= end &&
    start < size
    ? { start, end }
    : null;
}

function mediaHeaders(key: string) {
  return new globalThis.Headers({
    "cache-control": "private, max-age=3600",
    "content-type":
      cachedMediaContentType(path.extname(key).toLowerCase()) ?? "application/octet-stream",
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
  });
}

/**
 * Answers a request for a cached image or audio file: `requestPath` is the URL-encoded path under
 * `/media/`, read as raw bytes from the runtime's media storage and sliced to answer a range.
 * Anything outside the store, of the wrong type for its folder, or missing is a 404.
 */
export async function createMediaResponse(
  runtime: MediaRuntime,
  requestPath: string,
  options: { range?: string | null; method?: string } = {},
): Promise<Response> {
  const file = media.fromRequest(requestPath);
  if (file === null) {
    return notFound();
  }
  let bytes: Uint8Array | null;
  try {
    bytes = await readBytes(runtime.storage[file.store], file.key);
  } catch {
    // A storage that cannot read the key has no such file to serve.
    return notFound();
  }
  if (bytes === null || bytes.byteLength === 0) {
    return notFound();
  }
  const size = bytes.byteLength;
  const headers = mediaHeaders(file.key);
  const rangeHeader = options.range ?? "";
  const range =
    options.method !== "HEAD" && rangeHeader.length > 0 ? byteRange(rangeHeader, size) : undefined;
  if (range === null) {
    headers.set("content-range", `bytes */${size}`);
    return new globalThis.Response(null, { status: 416, headers });
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  headers.set("content-length", String(end - start + 1));
  if (range) {
    headers.set("content-range", `bytes ${start}-${end}/${size}`);
  }
  if (options.method === "HEAD") {
    return new globalThis.Response(null, { headers });
  }
  return new globalThis.Response(new Uint8Array(bytes.subarray(start, end + 1)), {
    status: range ? 206 : 200,
    headers,
  });
}
