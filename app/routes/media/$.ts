import { createFileRoute } from "@tanstack/react-router";
import {
  createMediaResponse,
  type MediaRuntime,
} from "@@/core/domains/media-store/media-response.ts";
import { getProductionRuntime } from "@@/core/domains/runtime/production-runtime.ts";

/** Answers a request under `/media/` from the runtime's media storage: GET also answers HEAD. */
export async function handleMediaRequest(
  runtime: MediaRuntime,
  request: Request,
  splat: string,
): Promise<Response> {
  return await createMediaResponse(runtime, splat, {
    range: request.headers.get("range"),
    method: request.method,
  });
}

// Serves the media store: avatars, story previews and audio.
export const Route = createFileRoute("/media/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        await handleMediaRequest(getProductionRuntime(), request, params._splat ?? ""),
    },
  },
});
