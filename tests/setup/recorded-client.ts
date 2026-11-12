import { z } from "zod";
import { type JsonValue, JsonValueSchema } from "@@/core/utils/json-value.ts";
import type { InstagramClient, StoryReel } from "@@/core/domains/instagram/instagram-types.ts";
import { createInstagramClient } from "@@/core/domains/instagram/story-client.ts";
import { StoryReelSchema } from "@@/core/domains/instagram/story-schemas.ts";
import type { RecordedPayloads } from "./seed.ts";

type InstagramSession = Parameters<typeof createInstagramClient>[0];
type BrowserFetch = InstagramSession["page"]["evaluate"];
/** What the browser page is asked to fetch. */
export type BrowserFetchInput = Parameters<BrowserFetch>[1];
/** What the browser page answers: a raw response body, before any parsing. */
export type BrowserFetchResponse = Awaited<ReturnType<BrowserFetch>>;

/** A recorded reels media page, typed enough for tests to edit the stories it holds. */
export const RecordedGalleryPageSchema = z.object({
  data: z.object({
    xdt_api__v1__feed__reels_media__connection: z.object({
      edges: z.array(z.object({ node: StoryReelSchema })),
      page_info: z.object({ has_next_page: z.boolean(), end_cursor: z.string().nullish() }),
    }),
  }),
});

const JSON_HEADERS = { "content-type": "application/json" };

export function jsonBody(body: JsonValue): BrowserFetchResponse {
  return { body: JSON.stringify(body), headers: JSON_HEADERS, ok: true, status: 200 };
}

function notFound(): BrowserFetchResponse {
  return { body: JSON.stringify({ status: "fail" }), headers: {}, ok: false, status: 404 };
}

/**
 * The production Instagram client, on a fake browser page that answers each fetch with
 * `respond`. Parsing, error handling and pagination run as they do against Instagram.
 */
export function createFakeInstagramClient(
  respond: (input: BrowserFetchInput) => BrowserFetchResponse,
): InstagramClient {
  return createInstagramClient({
    page: { evaluate: async (_fetch, input) => await Promise.resolve(respond(input)) },
  });
}

/** Just what the tray lists of a recorded gallery page's reels, so a page the story schema refuses still has a tray. */
const RecordedReelsSchema = z.object({
  data: z.object({
    xdt_api__v1__feed__reels_media__connection: z.object({
      edges: z.array(
        z.object({
          node: z.object({
            id: z.coerce.string(),
            items: z.array(z.object({ pk: z.coerce.string() })).optional(),
            user: JsonValueSchema,
          }),
        }),
      ),
    }),
  }),
});

function trayOf(galleryPages: Array<JsonValue>): JsonValue {
  const reels = galleryPages.flatMap(
    (page) => RecordedReelsSchema.parse(page).data.xdt_api__v1__feed__reels_media__connection.edges,
  );
  return {
    broadcasts: [],
    status: "ok",
    story_ranking_token: "seed",
    tray: reels.map(({ node }) => ({
      id: node.id,
      media_ids: (node.items ?? []).map(({ pk }) => pk),
      user: node.user,
    })),
  };
}

/**
 * An Instagram client that answers from recorded response bodies instead of a browser.
 * A gallery page the story schema refuses, such as a recorded error, is served as it was
 * recorded, so the production parser reports it. Without a recorded tray, the tray lists
 * the reels of the gallery pages.
 */
export function createRecordedClient(recorded: RecordedPayloads): InstagramClient {
  const pages = recorded.galleryPages.map((page) => ({
    page,
    parsed: RecordedGalleryPageSchema.safeParse(page),
  }));
  function reels(): Array<StoryReel> {
    return pages.flatMap(({ parsed }) =>
      parsed.success
        ? parsed.data.data.xdt_api__v1__feed__reels_media__connection.edges.map(({ node }) => node)
        : [],
    );
  }
  return createFakeInstagramClient((input) => {
    if (input.mediaQuery !== undefined) {
      const refused = pages.find(({ parsed }) => !parsed.success);
      if (refused !== undefined) {
        return jsonBody(refused.page);
      }
      const { reelIds } = input.mediaQuery;
      const requested = reels().filter(
        (reel) => reel.id !== undefined && reelIds.includes(reel.id),
      );
      return jsonBody(
        JsonValueSchema.parse({
          data: {
            xdt_api__v1__feed__reels_media__connection: {
              edges: requested.map((node) => ({ node })),
              page_info: { has_next_page: false, end_cursor: null },
            },
          },
        }),
      );
    }
    if (input.placeQuery !== undefined) {
      return recorded.place === undefined ? notFound() : jsonBody(recorded.place);
    }
    if (input.musicAssetId !== undefined) {
      return recorded.musicAsset === undefined ? notFound() : jsonBody(recorded.musicAsset);
    }
    return jsonBody(recorded.tray ?? trayOf(recorded.galleryPages));
  });
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
