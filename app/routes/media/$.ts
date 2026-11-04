import { createFileRoute } from "@tanstack/react-router";
import { createMediaResponse } from "@@/core/domains/media-store/media-response.ts";

// Serves the media store: avatars, story previews and audio. GET also answers HEAD.
export const Route = createFileRoute("/media/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        await createMediaResponse(params._splat ?? "", undefined, {
          range: request.headers.get("range"),
          method: request.method,
        }),
    },
  },
});
