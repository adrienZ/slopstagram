import type { InstagramClient, ReelTrayResponse } from "./story-types.ts";
import { requestWithRetry, type RetryOptions } from "./story-retry-service.ts";

export async function enrichTrayBiographies(
  client: InstagramClient,
  tray: ReelTrayResponse["tray"],
  retryOptions: RetryOptions,
): Promise<void> {
  const getUserProfile = client.getUserProfile?.bind(client);
  if (!getUserProfile) {
    return;
  }
  const users = new Map(tray.map((entry) => [entry.user.username, entry.user]));
  for (const [username, user] of users) {
    if (user.biography !== undefined) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- Bound profile request concurrency and stop on rate limits.
    const result = await requestWithRetry(
      async () => await getUserProfile(username),
      retryOptions,
      `profile for ${username}`,
    );
    if (!result.ok) {
      retryOptions.logger.warn(
        `could not fetch biography for ${username}: ${result.failure.message}`,
      );
      if (result.failure.reason === "rate_limited") {
        break;
      }
      continue;
    }
    const profile = result.value;
    const expectedId = user.pk ?? user.id;
    if (profile.username !== username || (expectedId !== undefined && profile.id !== expectedId)) {
      retryOptions.logger.warn(`profile identity mismatch for ${username}; biography was ignored`);
      continue;
    }
    for (const entry of tray.filter((candidate) => candidate.user.username === username)) {
      entry.user.biography = profile.biography;
    }
  }
}
