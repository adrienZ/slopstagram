import { z } from "zod";
import { StoryReelSchema, StoryTrayEntrySchema } from "./lib/story-schemas.ts";
import type { InstagramClient, ReelsMediaResponse, StoryReel } from "./instagram-types.ts";
import { JsonValueSchema } from "./lib/json-value.ts";

const ReelTrayResponseSchema = z.object({
  broadcasts: z.array(z.unknown()),
  story_ranking_token: z.string(),
  status: z.string(),
  tray: z.array(StoryTrayEntrySchema),
});

const IG_APP_ID = "936619743392459";
const REELS_TRAY_URL = "https://www.instagram.com/api/v1/feed/reels_tray/";
const REELS_MEDIA_URL = "https://www.instagram.com/graphql/query";
const MUSIC_ASSET_URL = "https://www.instagram.com/api/v1/clips/music/";
const PLACE_URL = "https://www.instagram.com/api/graphql";
// PolarisExploreLocationsContainerQuery, verified against the web location page.
const PLACE_DOCUMENT_ID = "28572807415659320";
// PolarisStoriesV3ReelPageGalleryQuery, verified against the web story viewer.
const REELS_MEDIA_DOCUMENT_ID = "29306733562261201";

class InstagramApiResponseError extends Error {
  override readonly name = "InstagramApiResponseError";
  readonly nonRetryable = true;
}

const GalleryResponseSchema = z
  .object({
    data: z
      .object({
        xdt_api__v1__feed__reels_media__connection: z.object({
          edges: z.array(z.object({ node: StoryReelSchema })),
          page_info: z.object({ has_next_page: z.boolean(), end_cursor: z.string().nullish() }),
        }),
      })
      .nullish(),
    errors: z.array(z.object({ message: z.string() })).optional(),
  })
  .transform((response) => {
    if ((response.errors?.length ?? 0) > 0 || !response.data) {
      throw new InstagramApiResponseError(
        `Instagram story media query failed: ${response.errors?.[0]?.message ?? "missing media data"}`,
      );
    }
    return response.data.xdt_api__v1__feed__reels_media__connection;
  });

function quoteNumericIdentifiers(body: string): string {
  // Instagram sometimes emits IDs as JSON numbers. Its media IDs exceed
  // JavaScript's safe-integer range, so JSON.parse would silently round them
  // before the schema gets a chance to normalize them.
  return body
    .replaceAll(
      /(?<identifier>"(?:id|pk|media_pk|reel_id|audio_asset_id|audio_cluster_id)"\s*:\s*)(?<numericIdentifier>\d+)/gu,
      '$<identifier>"$<numericIdentifier>"',
    )
    .replaceAll(
      /(?<arrayStart>"(?:media_ids|reel_ids)"\s*:\s*\[)(?<values>[^\]]*)(?<arrayEnd>\])/gu,
      (_match, _arrayStart: string, values: string) =>
        _match.replace(
          values,
          values.replaceAll(
            /(?<separator>^|,)\s*(?<numericIdentifier>\d+)\s*(?=,|$)/gu,
            '$<separator>"$<numericIdentifier>"',
          ),
        ),
    );
}

function parseInstagramResponse<T>(
  body: string,
  headers: Record<string, string>,
  schema: z.ZodType<T>,
): T {
  try {
    return schema.parse(JSON.parse(quoteNumericIdentifiers(body)));
  } catch (error) {
    const contentType = headers["content-type"] ?? "";
    if (!contentType.includes("application/json")) {
      throw new InstagramApiResponseError(
        `Instagram returned ${contentType || "a non-JSON response"}; run npm run auth to refresh the browser session`,
      );
    }

    throw error;
  }
}

interface BrowserFetchResponse {
  body: string;
  headers: Record<string, string>;
  ok: boolean;
  status: number;
}

interface BrowserFetchInput {
  appId: string;
  requestUrl: string;
  mediaQuery?: { documentId: string; reelIds: Array<string>; after?: string };
  musicAssetId?: string;
  placeQuery?: { documentId: string; placeId: string };
}

interface InstagramClientPage {
  evaluate: (
    pageFunction: (input: BrowserFetchInput) => Promise<BrowserFetchResponse>,
    input: BrowserFetchInput,
  ) => Promise<BrowserFetchResponse>;
}

interface InstagramClientSession {
  page: InstagramClientPage;
}

async function fetchFromInstagramPage(
  session: InstagramClientSession,
  url: string,
  mediaQuery?: BrowserFetchInput["mediaQuery"],
  musicAssetId?: string,
): Promise<BrowserFetchResponse> {
  const input: BrowserFetchInput = { appId: IG_APP_ID, requestUrl: url };
  if (mediaQuery) {
    input.mediaQuery = mediaQuery;
  }
  if (musicAssetId !== undefined) {
    input.musicAssetId = musicAssetId;
  }
  return await session.page.evaluate(
    async ({ appId, requestUrl, mediaQuery: query, musicAssetId: audioId }) => {
      const headers = new globalThis.Headers({ "x-ig-app-id": appId });
      let body: string | undefined;
      if (query || audioId !== undefined) {
        headers.set("content-type", "application/x-www-form-urlencoded");
        headers.set(
          "x-csrftoken",
          /(?:^|;\s*)csrftoken=(?<token>[^;]+)/u.exec(globalThis.document.cookie)?.groups?.token ??
            "",
        );
        body = query
          ? new globalThis.URLSearchParams({
              doc_id: query.documentId,
              variables: JSON.stringify({
                initial_reel_id: query.reelIds[0],
                reel_ids: query.reelIds,
                first: Math.min(10, query.reelIds.length),
                last: 0,
                after: query.after ?? null,
                __relay_internal__pv__PolarisCommunityNoteStoriesLabelEnabledrelayprovider: false,
              }),
            }).toString()
          : new globalThis.URLSearchParams({
              audio_cluster_id: audioId ?? "",
              original_sound_audio_asset_id: audioId ?? "",
              max_id: "",
            }).toString();
      }
      const response = await globalThis.fetch(requestUrl, {
        body,
        headers,
        method: query || audioId !== undefined ? "POST" : "GET",
        signal: audioId === undefined ? undefined : globalThis.AbortSignal.timeout(20_000),
      });

      return {
        body: await response.text(),
        headers: Object.fromEntries(response.headers.entries()),
        ok: response.ok,
        status: response.status,
      };
    },
    input,
  );
}

async function fetchPlaceFromInstagramPage(
  session: InstagramClientSession,
  placeId: string,
): Promise<BrowserFetchResponse> {
  return await session.page.evaluate(
    async ({ appId, requestUrl, placeQuery }) => {
      // The location query is only answered with the page's own anti-forgery tokens.
      // Avoid inner named functions here: tsx injects a __name helper the browser lacks.
      const pageRequire: (name: string) => Record<string, string | undefined> | undefined =
        globalThis.require;
      const lsd = pageRequire("LSD")?.token ?? "";
      const user = pageRequire("CurrentUserInitialData");
      const response = await globalThis.fetch(requestUrl, {
        body: new globalThis.URLSearchParams({
          doc_id: placeQuery?.documentId ?? "",
          variables: JSON.stringify({ location_id_str: placeQuery?.placeId, show_nearby: false }),
          fb_dtsg: pageRequire("DTSGInitialData")?.token ?? "",
          lsd,
          av: user?.NON_FACEBOOK_USER_ID ?? user?.ACCOUNT_ID ?? "",
        }).toString(),
        headers: new globalThis.Headers({
          "content-type": "application/x-www-form-urlencoded",
          "x-fb-lsd": lsd,
          "x-ig-app-id": appId,
        }),
        method: "POST",
        signal: globalThis.AbortSignal.timeout(20_000),
      });

      return {
        body: await response.text(),
        headers: Object.fromEntries(response.headers.entries()),
        ok: response.ok,
        status: response.status,
      };
    },
    {
      appId: IG_APP_ID,
      requestUrl: PLACE_URL,
      placeQuery: { documentId: PLACE_DOCUMENT_ID, placeId },
    },
  );
}

function toClientResponse<T>(response: BrowserFetchResponse, schema: z.ZodType<T>) {
  return {
    headers: response.headers,
    json: () => parseInstagramResponse(response.body, response.headers, schema),
    ok: response.ok,
    status: response.status,
  };
}

export function createInstagramClient(session: InstagramClientSession): InstagramClient {
  return {
    async getMusicAsset(audioId) {
      return toClientResponse(
        await fetchFromInstagramPage(session, MUSIC_ASSET_URL, undefined, audioId),
        JsonValueSchema,
      );
    },

    async getPlace(placeId) {
      return toClientResponse(await fetchPlaceFromInstagramPage(session, placeId), JsonValueSchema);
    },

    async getReelsMedia(reelIds) {
      if (reelIds.length === 0) {
        return { ok: true, status: 200, headers: {}, json: () => ({ reels_media: [] }) };
      }
      const reels: Array<StoryReel> = [];
      const cursors = new Set<string>();
      let after: string | undefined;
      for (;;) {
        // The gallery query limits each page to ten reels, even for a larger request.
        const query: NonNullable<BrowserFetchInput["mediaQuery"]> = {
          documentId: REELS_MEDIA_DOCUMENT_ID,
          reelIds,
        };
        if (after !== undefined) {
          query.after = after;
        }
        // oxlint-disable-next-line no-await-in-loop -- Each cursor depends on the previous page.
        const response = await fetchFromInstagramPage(session, REELS_MEDIA_URL, query);
        if (!response.ok) {
          return toClientResponse(
            response,
            GalleryResponseSchema.transform((page) => ({
              reels_media: page.edges.map(({ node }) => node),
            })),
          );
        }
        const page = parseInstagramResponse(response.body, response.headers, GalleryResponseSchema);
        reels.push(...page.edges.map(({ node }) => node));
        if (!page.page_info.has_next_page) {
          return {
            ok: true,
            status: response.status,
            headers: response.headers,
            json: () => ({ reels_media: reels }),
          };
        }
        const cursor = page.page_info.end_cursor;
        if (
          cursor === null ||
          cursor === undefined ||
          cursor.length === 0 ||
          cursors.has(cursor) ||
          cursors.size >= reelIds.length
        ) {
          throw new InstagramApiResponseError("Instagram story media pagination did not advance");
        }
        cursors.add(cursor);
        after = cursor;
      }
    },

    async getTray() {
      return toClientResponse(
        await fetchFromInstagramPage(session, REELS_TRAY_URL),
        ReelTrayResponseSchema,
      );
    },
  };
}

export function extractReels(response: ReelsMediaResponse): Record<string, StoryReel> {
  if (response.reels !== undefined) {
    return response.reels;
  }

  if (Array.isArray(response.reels_media)) {
    return Object.fromEntries(
      response.reels_media
        .filter((reel): reel is StoryReel & { id: string } => reel.id !== undefined)
        .map((reel) => [reel.id, reel]),
    );
  }

  return response.reels_media ?? {};
}
