import { z } from "zod";
import type { InstagramSession } from "./lib/playwright-service.ts";
import { StoryReelSchema, StoryTrayEntrySchema } from "./lib/story-schemas.ts";
import type { StoryReel } from "./lib/types.ts";
import type { InstagramClient } from "./stories.ts";

const ReelTrayResponseSchema = z.object({
  broadcasts: z.array(z.unknown()),
  story_ranking_token: z.string(),
  status: z.string(),
  tray: z.array(StoryTrayEntrySchema),
});

export type ReelsMediaResponse = {
  reels?: Record<string, StoryReel>;
  reels_media?: Record<string, StoryReel> | StoryReel[];
  status?: string | null;
};

const ReelsMediaResponseSchema = z.object({
  reels: z.record(z.string(), StoryReelSchema).optional(),
  reels_media: z
    .union([z.record(z.string(), StoryReelSchema), z.array(StoryReelSchema)])
    .optional(),
  status: z.string().nullable().optional(),
});

const IG_APP_ID = "936619743392459";
const REELS_TRAY_URL = "https://www.instagram.com/api/v1/feed/reels_tray/";
const REELS_MEDIA_URL = "https://www.instagram.com/api/v1/feed/reels_media/";

export class InstagramApiResponseError extends Error {
  readonly nonRetryable = true;
}

function quoteNumericIdentifiers(body: string): string {
  // Instagram sometimes emits IDs as JSON numbers. Its media IDs exceed
  // JavaScript's safe-integer range, so JSON.parse would silently round them
  // before the schema gets a chance to normalize them.
  return body
    .replaceAll(/("(?:id|pk|media_pk|reel_id)"\s*:\s*)(\d+)/gu, '$1"$2"')
    .replaceAll(
      /("(?:media_ids|reel_ids)"\s*:\s*\[)([^\]]*)(\])/gu,
      (_match, opening: string, values: string, closing: string) =>
        `${opening}${values.replaceAll(/(^|,)\s*(\d+)\s*(?=,|$)/gu, '$1"$2"')}${closing}`,
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

type BrowserFetchResponse = {
  body: string;
  headers: Record<string, string>;
  ok: boolean;
  status: number;
};

function fetchFromInstagramPage(
  session: InstagramSession,
  url: string,
): Promise<BrowserFetchResponse> {
  return session.page.evaluate(
    async ({ appId, requestUrl }) => {
      const response = await globalThis.fetch(requestUrl, { headers: { "x-ig-app-id": appId } });

      return {
        body: await response.text(),
        headers: Object.fromEntries(response.headers.entries()),
        ok: response.ok,
        status: response.status,
      };
    },
    { appId: IG_APP_ID, requestUrl: url },
  );
}

function toClientResponse<T>(response: BrowserFetchResponse, schema: z.ZodType<T>) {
  return {
    headers: response.headers,
    json: () => Promise.resolve(parseInstagramResponse(response.body, response.headers, schema)),
    ok: response.ok,
    status: response.status,
  };
}

export function createInstagramClient(session: InstagramSession): InstagramClient {
  return {
    async getReelsMedia(reelIds) {
      const query = reelIds.map((reelId) => `reel_ids=${encodeURIComponent(reelId)}`).join("&");
      return toClientResponse(
        await fetchFromInstagramPage(session, `${REELS_MEDIA_URL}?${query}`),
        ReelsMediaResponseSchema,
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
        .filter((reel): reel is StoryReel & { id: string } => typeof reel.id === "string")
        .map((reel) => [reel.id, reel]),
    );
  }

  return response.reels_media ?? {};
}
