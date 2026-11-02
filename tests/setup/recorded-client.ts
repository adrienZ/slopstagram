import type {
  InstagramClient,
  InstagramClientResponse,
  ReelTrayResponse,
  StoryReel,
} from "../../sdk/instagram-types.ts";
import type { JsonValue } from "../../sdk/lib/json-value.ts";
import { parseGalleryPage, parseTrayResponse } from "../../sdk/story-client-service.ts";
import type { RecordedPayloads } from "./seed.ts";

const JSON_HEADERS = { "content-type": "application/json" };

function found<T>(json: () => T): InstagramClientResponse<T> {
  return { headers: JSON_HEADERS, json, ok: true, status: 200 };
}

function notFound(): InstagramClientResponse<JsonValue> {
  return { headers: {}, json: () => ({ status: "fail" }), ok: false, status: 404 };
}

function trayEntryOf(reel: StoryReel): ReelTrayResponse["tray"][number] {
  if (reel.id === undefined || reel.user === undefined) {
    throw new Error("A recorded reel has no id or user to derive its tray entry from");
  }
  return {
    id: reel.id,
    media_ids: (reel.items ?? []).map(({ pk }) => pk),
    user: reel.user,
  };
}

/**
 * An Instagram client that answers from recorded response bodies instead of a browser.
 * Bodies go through the production parsers, so a recording that no longer matches the
 * schemas throws when the fetch reads it. Without a recorded tray, the tray lists the
 * reels of the gallery pages.
 */
export function createRecordedClient(recorded: RecordedPayloads): InstagramClient {
  function reels(): Array<StoryReel> {
    return recorded.galleryPages.flatMap((page) =>
      parseGalleryPage(JSON.stringify(page), JSON_HEADERS).edges.map(({ node }) => node),
    );
  }
  return {
    getMusicAsset: async () =>
      await Promise.resolve(
        recorded.musicAsset === undefined ? notFound() : found(() => recorded.musicAsset ?? null),
      ),
    getPlace: async () =>
      await Promise.resolve(
        recorded.place === undefined ? notFound() : found(() => recorded.place ?? null),
      ),
    getReelsMedia: async (reelIds) =>
      await Promise.resolve(
        found(() => ({
          reels_media: reels().filter((reel) => reel.id !== undefined && reelIds.includes(reel.id)),
        })),
      ),
    getTray: async () =>
      await Promise.resolve(
        found(() =>
          recorded.tray === undefined
            ? {
                broadcasts: [],
                status: "ok",
                story_ranking_token: "seed",
                tray: reels().map(trayEntryOf),
              }
            : parseTrayResponse(JSON.stringify(recorded.tray), JSON_HEADERS),
        ),
      ),
  };
}

/**
 * An Instagram client whose every request answers with `status`, after calling `onRequest`.
 * A non-transient status such as 401 fails at once, without the retry delays.
 */
export function createFailingClient(status: number, onRequest?: () => void): InstagramClient {
  async function refuse() {
    onRequest?.();
    return await Promise.resolve({
      headers: {},
      json: () => ({ status: "fail" }),
      ok: false,
      status,
    });
  }
  return {
    getMusicAsset: refuse,
    getPlace: refuse,
    getReelsMedia: async () =>
      await refuse().then((response) => ({ ...response, json: () => ({ reels_media: [] }) })),
    getTray: async () =>
      await refuse().then((response) => ({
        ...response,
        json: () => ({ broadcasts: [], status: "fail", story_ranking_token: "", tray: [] }),
      })),
  };
}
