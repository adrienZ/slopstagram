import process from "node:process";
import {
  closeInstagramSession,
  openInstagramSession,
} from "./lib/playwright-service.ts";

type ReelsMediaResponse = {
  reels?: Record<string, unknown>;
  reels_media?: Record<string, unknown>;
  status?: string | null;
};

const IG_APP_ID = "936619743392459";
const REELS_MEDIA_URL = "https://www.instagram.com/api/v1/feed/reels_media/";
const DEFAULT_PROFILE_PATH = ".playwright/user-data";

function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function getReelId(args: string[]): string {
  const reelId = args[0];

  if (!reelId || reelId.startsWith("--")) {
    throw new Error(
      "Usage: tsx scripts/fetch-story.ts <reel-id> [--profile <path>]",
    );
  }

  return reelId;
}

export async function fetchStory(
  reelId: string,
  args: string[] = process.argv.slice(3),
): Promise<Record<string, unknown>> {
  const profileArg = getArgValue(args, "--profile") ?? DEFAULT_PROFILE_PATH;
  const session = await openInstagramSession(profileArg);

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

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const reelId = getReelId(args);
  const payload = await fetchStory(reelId, args.slice(1));
  // process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
