import process from "node:process";
import {
  closeInstagramSession,
  openInstagramSession,
} from "./lib/playwright-service.js";

type ReelTrayEntry = {
  id: string;
  user?: {
    username?: string;
    full_name?: string;
  };
};

type ReelTrayResponse = {
  broadcasts?: unknown[];
  tray?: ReelTrayEntry[];
  story_ranking_token?: string | null;
  status?: string | null;
};

type ReelsMediaResponse = {
  reels?: Record<string, unknown>;
  reels_media?: Record<string, unknown>;
  status?: string | null;
};

const IG_APP_ID = "936619743392459";
const REELS_TRAY_URL = "https://www.instagram.com/api/v1/feed/reels_tray/";
const REELS_MEDIA_URL = "https://www.instagram.com/api/v1/feed/reels_media/";
const DEFAULT_PROFILE_PATH = ".playwright/user-data";
const REEL_IDS_PER_REQUEST = 25;

function getArgValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function main(): Promise<void> {
  const profileArg = getArgValue("--profile") ?? DEFAULT_PROFILE_PATH;
  const session = await openInstagramSession(profileArg);

  try {
    const trayResponse = await session.context.request.get(REELS_TRAY_URL, {
      headers: {
        "x-ig-app-id": IG_APP_ID,
      },
    });

    if (!trayResponse.ok()) {
      throw new Error(`Tray request failed with HTTP ${trayResponse.status()}`);
    }

    const trayJson = (await trayResponse.json()) as ReelTrayResponse;
    const tray = trayJson.tray ?? [];
    const reelIds = tray.map((entry) => entry.id);
    const reels: Record<string, unknown> = {};

    for (const idChunk of chunk(reelIds, REEL_IDS_PER_REQUEST)) {
      const query = idChunk
        .map((reelId) => `reel_ids=${encodeURIComponent(reelId)}`)
        .join("&");
      const reelsResponse = await session.context.request.get(
        `${REELS_MEDIA_URL}?${query}`,
        {
          headers: {
            "x-ig-app-id": IG_APP_ID,
          },
        },
      );

      if (!reelsResponse.ok()) {
        throw new Error(
          `Reels media request failed with HTTP ${reelsResponse.status()}`,
        );
      }

      const reelsJson = (await reelsResponse.json()) as ReelsMediaResponse;
      Object.assign(reels, reelsJson.reels ?? reelsJson.reels_media ?? {});
    }

    const payload = {
      xdt_api__v1__feed__reels_tray: {
        broadcasts: trayJson.broadcasts ?? [],
        tray,
        story_ranking_token: trayJson.story_ranking_token ?? null,
        status: trayJson.status ?? null,
      },
      reels,
    };

    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } finally {
    await closeInstagramSession(session);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
