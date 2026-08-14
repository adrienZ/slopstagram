import { readFile } from "node:fs/promises";
import path from "node:path";
import { defineEventHandler } from "nitro/h3";
import { BASE_CACHE_DIR, IMAGES_STORAGE_DIR } from "../../../sdk/lib/cache-service.ts";

export const mediaDirectory = path.resolve(BASE_CACHE_DIR, IMAGES_STORAGE_DIR);

function notFound(): Response {
  return new globalThis.Response("media not found", { status: 404 });
}

export function resolveMediaPath(
  requestPath: string,
  root: string = mediaDirectory,
): string | null {
  let decodedPath: string;

  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, decodedPath);
  const relativePath = path.relative(resolvedRoot, resolvedPath);

  if (
    relativePath.length === 0 ||
    relativePath.startsWith(`..${path.sep}`) ||
    relativePath === ".." ||
    path.isAbsolute(relativePath) ||
    path.extname(resolvedPath).toLowerCase() !== ".jpg"
  ) {
    return null;
  }

  return resolvedPath;
}

export async function createMediaResponse(
  requestPath: string,
  root: string = mediaDirectory,
): Promise<Response> {
  const mediaPath = resolveMediaPath(requestPath, root);
  if (mediaPath === null) return notFound();

  try {
    return new globalThis.Response(await readFile(mediaPath), {
      headers: {
        "cache-control": "private, max-age=3600",
        "content-type": "image/jpeg",
      },
    });
  } catch {
    return notFound();
  }
}

export default defineEventHandler((event) => {
  const requestPath = event.context.params?.path;
  return typeof requestPath === "string" ? createMediaResponse(requestPath) : notFound();
});
