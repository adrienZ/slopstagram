import process from "node:process";
import {
  closeInstagramSession,
  DEFAULT_PROFILE_PATH,
  openInstagramSession,
} from "./lib/playwright-service.ts";

type ReelsMediaResponse = {
  reels?: Record<string, unknown>;
  reels_media?: Record<string, unknown>;
  status?: string | null;
};

const IG_APP_ID = "936619743392459";
const REELS_MEDIA_URL = "https://www.instagram.com/api/v1/feed/reels_media/";

export async function fetchStory(
  reelId: string,
  args: string[] = process.argv.slice(3),
): Promise<Record<string, unknown>> {
  const profileArg = args.includes("--profile")
    ? args[args.indexOf("--profile") + 1] ?? DEFAULT_PROFILE_PATH
    : DEFAULT_PROFILE_PATH;
  const session = await openInstagramSession({ profilePath: profileArg });

  try {
    const query = `reel_ids=${encodeURIComponent(reelId)}`;
    const response = await session.context.request.get(
      `${REELS_MEDIA_URL}?${query}`,
      {
        headers: {
          "x-ig-app-id": IG_APP_ID,
        },
      },
    );

    if (!response.ok()) {
      throw new Error(
        `Reels media request failed with HTTP ${response.status()}`,
      );
    }

    const responseJson = (await response.json()) as ReelsMediaResponse;

    return responseJson.reels ?? responseJson.reels_media ?? {};
  } finally {
    await closeInstagramSession(session);
  }
}