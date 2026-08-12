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
  reels_media?: Record<string, StoryReel>;
  status?: string | null;
};

const ReelsMediaResponseSchema = z.object({
  reels: z.record(z.string(), StoryReelSchema).optional(),
  reels_media: z.record(z.string(), StoryReelSchema).optional(),
  status: z.string().nullable().optional(),
});

const IG_APP_ID = "936619743392459";
const REELS_TRAY_URL = "https://www.instagram.com/api/v1/feed/reels_tray/";
const REELS_MEDIA_URL = "https://www.instagram.com/api/v1/feed/reels_media/";

export function createInstagramClient(session: InstagramSession): InstagramClient {
  return {
    async getReelsMedia(reelIds) {
      const query = reelIds.map((reelId) => `reel_ids=${encodeURIComponent(reelId)}`).join("&");
      const response = await session.context.request.get(`${REELS_MEDIA_URL}?${query}`, {
        headers: {
          "x-ig-app-id": IG_APP_ID,
        },
      });

      return {
        headers: response.headers(),
        json: async () => ReelsMediaResponseSchema.parse(await response.json()),
        ok: response.ok(),
        status: response.status(),
      };
    },

    async getTray() {
      const response = await session.context.request.get(REELS_TRAY_URL, {
        headers: {
          "x-ig-app-id": IG_APP_ID,
        },
      });

      return {
        headers: response.headers(),
        json: async () => ReelTrayResponseSchema.parse(await response.json()),
        ok: response.ok(),
        status: response.status(),
      };
    },
  };
}

export function extractReels(response: ReelsMediaResponse): Record<string, StoryReel> {
  return response.reels ?? response.reels_media ?? {};
}
