import { loadReport } from "../../server/report-handler.tsx";
import { loadUserTimeline } from "../../server/user-timeline-handler.tsx";
import { pageNow, timelineAccount } from "./page-data.ts";
import { seedPageDatabase } from "./seed-pages.ts";

// Importing this module seeds the application database (in memory under vitest) once per test file.
await seedPageDatabase();

/** What the real loaders return over the seeded database: the data to derive expectations from. */
export const reportProps = loadReport(pageNow);
export const timelineProps = loadUserTimeline(timelineAccount, pageNow);
export const [timelineEntry] = timelineProps.timeline.stories;

/** The sticker kinds the loader reports for a set of stories: the distinct kinds, alphabetically. */
export function stickerKindsOf(
  stories: Array<{
    story: { annotations?: { stickers: Array<{ kind: string }> } };
  }>,
): Array<string> {
  return [
    ...new Set(
      stories.flatMap(({ story }) => story.annotations?.stickers.map(({ kind }) => kind) ?? []),
    ),
  ].toSorted();
}
