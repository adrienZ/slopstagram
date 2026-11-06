import type {
  FeedUserSummary,
  RequestedFeedUserSummary,
} from "@@/core/domains/story-feed/feed-user-summary.ts";
import { formatUserHandle } from "../../utils/helper.ts";

function formatStoryCount(count: number): string {
  return `${count} ${count > 1 ? "stories" : "story"} dans les dernières 24 heures`;
}

function describeOutcome(outcome: FeedUserSummary, handle: string): string {
  if (outcome.status === "found") {
    return outcome.summary;
  }
  if (outcome.status === "error") {
    return `Aucun compte ne s’appelle ${handle}.`;
  }
  return outcome.reason === "no_stories_in_last_24h"
    ? "Aucune story publiée dans les dernières 24 heures."
    : "Le résumé n’est pas encore généré : il le sera au prochain relevé des stories.";
}

/** The user summaries the Assistant read, as plain text, for each account asked. */
export function FeedUserSummariesDetails({
  results,
}: {
  results: Array<RequestedFeedUserSummary>;
}) {
  return (
    <ul aria-label="Résumés lus" className="tw:grid tw:gap-3">
      {results.map(({ outcome, requestedUsername }) => {
        const handle = formatUserHandle(
          outcome.status === "error" ? requestedUsername : outcome.username,
        );
        return (
          <li key={requestedUsername} className="tw:grid tw:gap-1">
            <span className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
              <span className="tw:font-medium">{handle}</span>
              {outcome.status === "found" && <span>{formatStoryCount(outcome.storyCount)}</span>}
            </span>
            <p className="tw:leading-relaxed">{describeOutcome(outcome, handle)}</p>
          </li>
        );
      })}
    </ul>
  );
}
