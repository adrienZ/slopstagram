import type { createInstagramClient } from "../sdk/story-client-service.ts";
import type { JsonValue } from "../sdk/lib/json-value.ts";

type Session = Parameters<typeof createInstagramClient>[0];
type Evaluate = Session["page"]["evaluate"];
type Request = Parameters<Evaluate>[1];
type Response = Awaited<ReturnType<Evaluate>>;

export interface RecordedInstagram {
  /** The reels tray response body. */
  tray: JsonValue;
  /** The reels media response for one request: `after` is the cursor of the page being asked for. */
  galleryPage: (reelIds: Array<string>, after: string | undefined) => JsonValue;
  /** The place lookup response body, answered for every place. Without it lookups answer 404. */
  place?: JsonValue;
  /** The music asset response body, answered for every asset. Without it lookups answer 404. */
  musicAsset?: JsonValue;
}

function jsonResponse(body: JsonValue, status = 200): Response {
  return {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    ok: status >= 200 && status < 300,
    status,
  };
}

function notFound(): Response {
  return jsonResponse({ status: "fail" }, 404);
}

function answer(recorded: RecordedInstagram, request: Request): Response {
  if (request.requestUrl.endsWith("/reels_tray/")) {
    return jsonResponse(recorded.tray);
  }
  if (request.mediaQuery !== undefined) {
    return jsonResponse(recorded.galleryPage(request.mediaQuery.reelIds, request.mediaQuery.after));
  }
  if (request.musicAssetId !== undefined) {
    return recorded.musicAsset === undefined ? notFound() : jsonResponse(recorded.musicAsset);
  }
  if (request.placeQuery !== undefined) {
    return recorded.place === undefined ? notFound() : jsonResponse(recorded.place);
  }
  return notFound();
}

/**
 * The browser session the app talks to Instagram through, serving recorded response
 * bodies. The real `createInstagramClient` runs on top, so recordings go through the
 * production parsing and schemas. It is the only fake in the seed.
 */
export function createRecordedSession(recorded: RecordedInstagram): Session {
  return {
    page: {
      evaluate: async (_pageFunction, request: Request) =>
        await Promise.resolve(answer(recorded, request)),
    },
  };
}

/**
 * A browser session that answers every request with `status`, after calling `onRequest`.
 * A non-transient status such as 401 fails at once, without the client's retry delays.
 */
export function createFailingSession(status: number, onRequest?: () => void): Session {
  return {
    page: {
      evaluate: async () => {
        onRequest?.();
        return await Promise.resolve(jsonResponse({ status: "fail" }, status));
      },
    },
  };
}
