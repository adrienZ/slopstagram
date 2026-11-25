import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type {
  FeedUserSummary,
  RequestedFeedUserSummary,
} from "@@/core/domains/story-feed/feed-user-summary.ts";
import { formatUserHandle } from "../utils/helper.ts";

function describeOutcome(outcome: FeedUserSummary, handle: string, t: TFunction): string {
  if (outcome.status === "found") {
    return outcome.summary;
  }

  if (outcome.status === "error") {
    return t("assistant.unknownAccount", { handle });
  }

  return outcome.reason === "no_stories_in_last_24h"
    ? t("common.noStoriesIn24h")
    : t("assistant.summaryPending");
}

export function FeedUserSummariesDetails({
  results,
}: {
  results: Array<RequestedFeedUserSummary>;
}) {
  const { t } = useTranslation();

  return (
    <ul aria-label={t("assistant.summariesRead")} className="tw:grid tw:gap-3">
      {results.map(({ outcome, requestedUsername }) => {
        const handle = formatUserHandle(
          outcome.status === "error" ? requestedUsername : outcome.username,
        );

        return (
          <li key={requestedUsername} className="tw:grid tw:gap-1">
            <span className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
              <span className="tw:font-medium">{handle}</span>
              {outcome.status === "found" && (
                <span>{t("assistant.storiesIn24h", { count: outcome.storyCount })}</span>
              )}
            </span>
            <p className="tw:leading-relaxed">{describeOutcome(outcome, handle, t)}</p>
          </li>
        );
      })}
    </ul>
  );
}
