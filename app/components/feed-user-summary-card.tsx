import type { FeedUserSummary } from "@@/core/domains/story-feed/feed-user-summary.ts";
import type { SidebarUser } from "../loaders/sidebar-users.ts";
import { formatUserHandle } from "../utils/helper.ts";
import { presentSticker } from "../utils/sticker-presentation.ts";
import { Card, CardContent, CardHeader } from "../shadcn/ui/card.tsx";
import { Sticker } from "./sticker.tsx";

function formatStoryCount(count: number): string {
  return `${count} ${count > 1 ? "stories" : "story"} dans les dernières 24 heures`;
}

function describeOutcome(outcome: FeedUserSummary, handle: string): string {
  if (outcome.status === "found") {
    return outcome.summary;
  }
  if (outcome.status === "error") {
    return `Aucun compte enregistré ne s’appelle ${handle}.`;
  }
  return outcome.reason === "no_stories_in_last_24h"
    ? "Aucune story publiée dans les dernières 24 heures."
    : "Le résumé n’est pas encore généré : il le sera au prochain relevé des stories.";
}

/** The user summary the Assistant read for one account, rendered from the tool's data. */
export function FeedUserSummaryCard({
  accounts,
  outcome,
  username,
}: {
  accounts: Array<SidebarUser>;
  outcome: FeedUserSummary;
  /** The username the Assistant asked for, shown when no saved account has it. */
  username: string;
}) {
  const handle = formatUserHandle(outcome.status === "error" ? username : outcome.username);
  return (
    <section aria-label={`Résumé de ${handle}`} className="tw:w-full">
      <Card size="sm">
        <CardHeader className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          {outcome.status === "error" ? (
            <span className="tw:font-medium">{handle}</span>
          ) : (
            <Sticker sticker={presentSticker("mention", handle, accounts)} />
          )}
          {outcome.status === "found" && (
            <span className="tw:text-muted-foreground">{formatStoryCount(outcome.storyCount)}</span>
          )}
        </CardHeader>
        <CardContent>
          <p
            className={
              outcome.status === "found" ? "tw:leading-relaxed" : "tw:text-muted-foreground"
            }
          >
            {describeOutcome(outcome, handle)}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
