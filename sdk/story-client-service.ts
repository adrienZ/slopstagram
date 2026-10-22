import { z } from "zod";
import { StoryReelSchema, StoryTrayEntrySchema } from "./lib/story-schemas.ts";
import type { StoryReel } from "./lib/types.ts";
import type { InstagramClient } from "./stories.ts";

const ReelTrayResponseSchema = z.object({
  broadcasts: z.array(z.unknown()),
  story_ranking_token: z.string(),
  status: z.string(),
  tray: z.array(StoryTrayEntrySchema),
});

export interface ReelsMediaResponse {
  reels?: Record<string, StoryReel>;
  reels_media?: Record<string, StoryReel> | Array<StoryReel>;
  status?: string | null;
}

const IG_APP_ID = "936619743392459";
const REELS_TRAY_URL = "https://www.instagram.com/api/v1/feed/reels_tray/";
const REELS_MEDIA_URL = "https://www.instagram.com/graphql/query";
// PolarisStoriesV3ReelPageStandaloneQuery, verified against the web story viewer.
const REELS_MEDIA_DOCUMENT_ID = "28449850404637481";

export class InstagramApiResponseError extends Error {
  override readonly name = "InstagramApiResponseError";
  readonly nonRetryable = true;
}

const GraphqlReelsMediaResponseSchema = z
  .object({
    data: z
      .object({
        xdt_api__v1__feed__reels_media: z.object({
          reels_media: z.array(StoryReelSchema),
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

    return response.data.xdt_api__v1__feed__reels_media;
  });

function quoteNumericIdentifiers(body: string): string {
  // Instagram sometimes emits IDs as JSON numbers. Its media IDs exceed
  // JavaScript's safe-integer range, so JSON.parse would silently round them
  // before the schema gets a chance to normalize them.
  return body
    .replaceAll(
      /(?<identifier>"(?:id|pk|media_pk|reel_id)"\s*:\s*)(?<numericIdentifier>\d+)/gu,
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
  mediaQuery?: { documentId: string; reelIds: Array<string> };
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
): Promise<BrowserFetchResponse> {
  const input: BrowserFetchInput = { appId: IG_APP_ID, requestUrl: url };
  if (mediaQuery) {
    input.mediaQuery = mediaQuery;
  }
  return await session.page.evaluate(async ({ appId, requestUrl, mediaQuery: query }) => {
    const headers = new globalThis.Headers({ "x-ig-app-id": appId });
    let body: string | undefined;
    if (query) {
      headers.set("content-type", "application/x-www-form-urlencoded");
      headers.set(
        "x-csrftoken",
        /(?:^|;\s*)csrftoken=(?<token>[^;]+)/u.exec(globalThis.document.cookie)?.groups?.token ??
          "",
      );
      body = new globalThis.URLSearchParams({
        doc_id: query.documentId,
        variables: JSON.stringify({
          reel_ids_arr: query.reelIds,
          media_id: null,
          is_highlight: false,
          __relay_internal__pv__PolarisCommunityNoteStoriesLabelEnabledrelayprovider: false,
        }),
      }).toString();
    }
    const response = await globalThis.fetch(requestUrl, {
      body,
      headers,
      method: query ? "POST" : "GET",
    });

    return {
      body: await response.text(),
      headers: Object.fromEntries(response.headers.entries()),
      ok: response.ok,
      status: response.status,
    };
  }, input);
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
    async getUserProfile(username) {
      const schema = z
        .object({
          data: z.object({
            user: z.object({
              biography: z.string().nullable(),
              id: z.union([z.string(), z.number()]).transform(String),
              username: z.string(),
            }),
          }),
        })
        .transform((response) => response.data.user);
      return toClientResponse(
        await fetchFromInstagramPage(
          session,
          `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
        ),
        schema,
      );
    },
    async getReelsMedia(reelIds) {
      return toClientResponse(
        await fetchFromInstagramPage(session, REELS_MEDIA_URL, {
          documentId: REELS_MEDIA_DOCUMENT_ID,
          reelIds,
        }),
        GraphqlReelsMediaResponseSchema,
      );
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
