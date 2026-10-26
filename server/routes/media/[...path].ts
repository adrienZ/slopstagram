import { open, realpath, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { defineEventHandler } from "nitro/h3";
import { cachedMediaContentType } from "../../../sdk/lib/music-media-types.ts";
import { z } from "zod";
import { BASE_CACHE_DIR, IMAGES_STORAGE_DIR } from "../../../sdk/lib/cache-service.ts";

export const mediaDirectory = path.resolve(BASE_CACHE_DIR, IMAGES_STORAGE_DIR);
function notFound(): Response {
  return new globalThis.Response("media not found", { status: 404 });
}
function isInside(root: string, target: string) {
  const relative = path.relative(root, target);
  return (
    relative.length > 0 &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export function resolveMediaPath(
  requestPath: string,
  root: string = mediaDirectory,
): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, decoded);
  const relative = path.relative(resolvedRoot, resolved);
  const extension = path.extname(resolved).toLowerCase();
  if (
    !isInside(resolvedRoot, resolved) ||
    cachedMediaContentType(extension) === undefined ||
    (extension !== ".jpg" && !relative.startsWith(`music${path.sep}`))
  ) {
    return null;
  }
  return resolved;
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

function mediaStream(file: FileHandle, start: number, end: number) {
  let position = start;
  return new globalThis.ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const buffer = new Uint8Array(Math.min(64 * 1024, end - position + 1));
        const chunk = await file.read(buffer, 0, buffer.length, position);
        if (chunk.bytesRead === 0) {
          throw new Error("Cached media truncated");
        }
        position += chunk.bytesRead;
        controller.enqueue(buffer.subarray(0, chunk.bytesRead));
        if (position > end) {
          controller.close();
          await file.close();
        }
      } catch (error) {
        controller.error(error);
        await file.close();
      }
    },
    async cancel() {
      await file.close();
    },
  });
}

function mediaHeaders(mediaPath: string) {
  return new globalThis.Headers({
    "cache-control": "private, max-age=3600",
    "content-type":
      cachedMediaContentType(path.extname(mediaPath).toLowerCase()) ?? "application/octet-stream",
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
  });
}

export async function createMediaResponse(
  requestPath: string,
  root: string = mediaDirectory,
  options: { range?: string | null; method?: string } = {},
): Promise<Response> {
  const mediaPath = resolveMediaPath(requestPath, root);
  if (mediaPath === null) {
    return notFound();
  }
  try {
    if (!isInside(await realpath(root), await realpath(mediaPath))) {
      return notFound();
    }
    const file = await open(mediaPath, "r");
    let streaming = false;
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size === 0) {
        return notFound();
      }
      const headers = mediaHeaders(mediaPath);
      const rangeHeader = options.range ?? "";
      const range =
        options.method !== "HEAD" && rangeHeader.length > 0
          ? byteRange(rangeHeader, info.size)
          : undefined;
      if (range === null) {
        headers.set("content-range", `bytes */${info.size}`);
        return new globalThis.Response(null, { status: 416, headers });
      }
      const start = range?.start ?? 0;
      const end = range?.end ?? info.size - 1;
      headers.set("content-length", String(end - start + 1));
      if (range) {
        headers.set("content-range", `bytes ${start}-${end}/${info.size}`);
      }
      // A stream reads only the requested range; the handle closes after transfer/cancellation.
      if (options.method === "HEAD") {
        return new globalThis.Response(null, { headers });
      }
      const body = mediaStream(file, start, end);
      streaming = true;
      return new globalThis.Response(body, { status: range ? 206 : 200, headers });
    } finally {
      if (!streaming) {
        await file.close();
      }
    }
  } catch {
    return notFound();
  }
}

export default defineEventHandler(async (event) => {
  const parsedPath = z.string().safeParse(event.context.params?.path);
  return parsedPath.success
    ? await createMediaResponse(parsedPath.data, mediaDirectory, {
        range: event.req.headers.get("range"),
        method: event.req.method,
      })
    : notFound();
});
