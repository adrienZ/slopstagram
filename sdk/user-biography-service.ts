import type { Logger } from "./lib/logging-service.ts";
import type { StoryTrayEntry } from "./lib/types.ts";
import type { InstagramClient } from "./story-types.ts";

export async function enrichTrayBiographies(
  tray: Array<StoryTrayEntry>,
  client: InstagramClient,
  logger: Logger,
): Promise<void> {
  if (!client.getUserProfile) {
    return;
  }
  const users = Map.groupBy(tray, (entry) => entry.user.username.toLowerCase());
  for (const [username, entries] of users) {
    if (entries.every((entry) => entry.user.biography !== undefined)) {
      continue;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- One request per account, sequentially, so rate limits stop further requests.
      const response = await client.getUserProfile(username);
      if (!response.ok) {
        logger.warn(`Profile lookup for ${username} failed (HTTP ${response.status})`);
        if ([401, 403, 429].includes(response.status)) {
          break;
        }
        continue;
      }
      const profile = response.json();
      if (profile.username.toLowerCase() !== username) {
        logger.warn(`Profile lookup returned a different username for ${username}`);
        continue;
      }
      for (const entry of entries) {
        const expectedPk = entry.user.pk ?? entry.user.id ?? entry.id;
        if (profile.pk === expectedPk && profile.biography !== undefined) {
          entry.user.biography = profile.biography;
        }
      }
    } catch {
      logger.warn(`Profile lookup for ${username} failed; keeping the existing biography`);
    }
  }
}
