import { eq, sql } from "drizzle-orm";
import { useDrizzle } from "../../sdk/database/client.ts";
import { migrateDatabase } from "../../sdk/database/migrate.ts";
import { stories } from "../../sdk/entities/story.ts";
import { appleVisionRepository } from "../../sdk/repositories/apple-vision-repository.ts";
import { instagramUserRepository } from "../../sdk/repositories/instagram-user-repository.ts";
import { createReportFeed } from "../../sdk/story-feed.ts";
import { resolveUserSummariesForReport } from "../../sdk/user-summary.ts";
import { createMockLogger } from "../mock-helpers.ts";
import { readRecordedPayloads, seedRecordedStories } from "../setup/seed.ts";
import {
  appleCaption,
  captionedStoryPk,
  hostileCaption,
  mentionedAccount,
  outsideFeedAccount,
  PAST_STORY_AGE_SECONDS,
  pageNow,
  pastStoryPk,
  PUBLISHED_BEFORE_SECONDS,
  userSummary,
} from "./page-data.ts";

/**
 * Seeds the application database (in memory under vitest) with what the page tests render:
 * the recorded stories through production ingestion, plus the accounts, captions and
 * summaries that ingestion does not produce.
 */
export async function seedPageDatabase(): Promise<void> {
  migrateDatabase();
  await seedRecordedStories(await readRecordedPayloads(), {
    publishedBefore: { now: pageNow, seconds: PUBLISHED_BEFORE_SECONDS },
  });
  // The recording has neither a markup-laden caption nor a story outside the rolling 24 hours.
  const database = useDrizzle();
  database
    .update(stories)
    .set({ accessibilityCaption: hostileCaption })
    .where(eq(stories.mediaPk, captionedStoryPk))
    .run();
  database
    .update(stories)
    .set({ takenAt: sql`${stories.takenAt} - ${PAST_STORY_AGE_SECONDS}` })
    .where(eq(stories.mediaPk, pastStoryPk))
    .run();
  await appleVisionRepository.save(captionedStoryPk, appleCaption);
  for (const [pk, username] of [
    ["700000000000901", outsideFeedAccount],
    ["700000000000114", mentionedAccount],
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- Two inserts, saved in order.
    await instagramUserRepository.save({
      full_name: null,
      id: pk,
      pk,
      username,
    });
  }
  await resolveUserSummariesForReport(
    { output: { users: createReportFeed(pageNow).users } },
    {
      logger: createMockLogger(),
      runUserSummary: async () => await Promise.resolve(JSON.stringify({ summary: userSummary })),
    },
  );
}
