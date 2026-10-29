import type { createInstagramClient } from "../sdk/story-client-service.ts";
import type { JsonValue } from "../sdk/lib/json-value.ts";

type Session = Parameters<typeof createInstagramClient>[0];
type Evaluate = Session["page"]["evaluate"];
type Request = Parameters<Evaluate>[1];
type Response = Awaited<ReturnType<Evaluate>>;

export interface RecordedInstagram {
  /** The reels tray response body. */
  tray: JsonValue;
  /** The reels media pages: each request is answered with the page that holds its first reel. */
  galleryPage: (reelIds: Array<string>) => JsonValue;
}

function jsonResponse(body: JsonValue, status = 200): Response {
  return {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    ok: status >= 200 && status < 300,
    status,
  };
}

/**
 * The browser session the app talks to Instagram through, serving recorded response
 * bodies. The real `createInstagramClient` runs on top, so recordings go through the
 * production parsing and schemas. Place and music asset lookups answer 404.
 */
export function createRecordedSession(recorded: RecordedInstagram): Session {
  return {
    page: {
      evaluate: async (_pageFunction, request: Request) =>
        await Promise.resolve(
          // oxlint-disable-next-line no-nested-ternary -- A flat routing table of the three endpoints the ingestion calls.
          request.requestUrl.endsWith("/reels_tray/")
            ? jsonResponse(recorded.tray)
            : request.mediaQuery === undefined
              ? jsonResponse({ status: "fail" }, 404)
              : jsonResponse(recorded.galleryPage(request.mediaQuery.reelIds)),
        ),
    },
  };
}
