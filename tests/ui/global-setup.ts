import process from "node:process";
import type { TestProject } from "vitest/node";
import type { ReportPageProps } from "../../server/pages/report.tsx";
import type { TimelineContentProps } from "../../server/pages/users/$username.tsx";
import {
  appleCaption,
  captionedStoryPk,
  emptyDay,
  hostileCaption,
  mentionedAccount,
  namedAccount,
  outsideFeedAccount,
  PAST_STORY_AGE_SECONDS,
  pageNow,
  pastDay,
  pastStoryPk,
  PUBLISHED_BEFORE_SECONDS,
  timelineAccount,
  userSummary,
} from "./page-data.ts";

declare module "vitest" {
  export interface ProvidedContext {
    reportProps: ReportPageProps;
    emptyTodayReportProps: ReportPageProps;
    pastReportProps: ReportPageProps;
    emptyDayReportProps: ReportPageProps;
    timelineProps: TimelineContentProps;
  }
}

const threeDays = 3 * 24 * 3600 * 1000;

/**
 * jsdom tests cannot run the SQLite-backed loaders, so Node computes their page props
 * once: the real loaders over a database seeded by the production ingestion pipeline.
 */
export default async function setup(project: TestProject): Promise<void> {
  // SAFETY: the repositories open the application database when imported, so this must be set first.
  process.env.SLOPSTAGRAM_DATABASE_PATH = ":memory:";
  const { createMockLogger } = await import("../mock-helpers.ts");
  const { editRecordedStories, readRecordedPayloads, seedRecordedStories } =
    await import("../seed.ts");
  const { migrateDatabase } = await import("../../sdk/database/migrate.ts");
  const { appleVisionRepository } =
    await import("../../sdk/repositories/apple-vision-repository.ts");
  const { instagramUserRepository } =
    await import("../../sdk/repositories/instagram-user-repository.ts");
  const { createReportFeed } = await import("../../sdk/story-feed.ts");
  const { resolveUserSummariesForReport } = await import("../../sdk/user-summary.ts");
  const { fetchReport } = await import("../../server/report-query.ts");
  const { fetchUserTimeline } = await import("../../server/user-timeline-query.ts");

  migrateDatabase();
  const recorded = editRecordedStories(await readRecordedPayloads(), (story, owner) => {
    if (owner.username === namedAccount.username) {
      owner.full_name = namedAccount.fullName;
    }
    if (story.pk === captionedStoryPk) {
      story.accessibility_caption = hostileCaption;
    }
    if (story.pk === pastStoryPk) {
      story.taken_at -= PAST_STORY_AGE_SECONDS;
    }
  });
  await seedRecordedStories(recorded, {
    publishedBefore: { now: pageNow, seconds: PUBLISHED_BEFORE_SECONDS },
  });
  await appleVisionRepository.save(captionedStoryPk, appleCaption);
  for (const [pk, username] of [
    ["700000000000901", outsideFeedAccount],
    ["700000000000021", mentionedAccount],
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

  project.provide("reportProps", await fetchReport({}, pageNow));
  project.provide(
    "emptyTodayReportProps",
    await fetchReport({}, new Date(pageNow.getTime() + threeDays)),
  );
  project.provide("pastReportProps", await fetchReport({ date: pastDay }, pageNow));
  project.provide("emptyDayReportProps", await fetchReport({ date: emptyDay }, pageNow));
  project.provide("timelineProps", await fetchUserTimeline(timelineAccount, pageNow));
}
