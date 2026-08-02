import { createHash } from "node:crypto";
import type { StoryOutputUser } from "./types.ts";

export function getReportUserKey(user: StoryOutputUser, index: number): string {
  const username = user.username?.trim();

  if (username) {
    return `username:${username}`;
  }

  const reelIds = user.reel_ids.map((reelId) => reelId.trim()).filter(Boolean);

  if (reelIds.length > 0) {
    return `reels:${reelIds.join(",")}`;
  }

  const fallbackHash = createHash("sha256")
    .update(JSON.stringify(user))
    .digest("hex")
    .slice(0, 16);

  return `index:${index}:${fallbackHash}`;
}
