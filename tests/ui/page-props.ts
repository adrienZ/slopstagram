import { inject } from "vitest";

/** Page props produced by the real loaders over the seeded database (see tests/ui/global-setup.ts). */
export const reportProps = inject("reportProps");
export const emptyTodayReportProps = inject("emptyTodayReportProps");
export const pastReportProps = inject("pastReportProps");
export const emptyDayReportProps = inject("emptyDayReportProps");
export const timelineProps = inject("timelineProps");
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
