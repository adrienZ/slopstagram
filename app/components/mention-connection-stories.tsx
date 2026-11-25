import { useTranslation } from "react-i18next";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { StoryCardData } from "../utils/story-cards.ts";
import type { OpenStory } from "../hooks/use-open-story.ts";
import { Button } from "../shadcn/ui/button.tsx";
import { formatConjunction } from "../utils/helper.ts";
import { StoryCard } from "./story-card.tsx";

const PAGE_SIZE = 3;

export function MentionConnectionStories({
  labels,
  stories,
  onClose,
  onOpenStory,
}: {
  labels: readonly [string, string];
  stories: Array<StoryCardData>;
  onClose: () => void;
  onOpenStory: OpenStory;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(stories.length / PAGE_SIZE);
  const title = t("graph.connectionStories", { labels: formatConjunction(labels) });

  return (
    <section
      aria-label={title}
      className="tw:absolute tw:right-3 tw:bottom-16 tw:flex tw:w-72 tw:max-w-[calc(100%-1.5rem)] tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:bg-popover tw:p-3 tw:text-popover-foreground tw:shadow-md"
    >
      <div className="tw:flex tw:items-start tw:justify-between tw:gap-2">
        <h2 className="tw:min-w-0 tw:text-sm tw:font-medium tw:wrap-anywhere">
          {labels.join(" · ")}
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("graph.closeConnectionStories")}
          onClick={onClose}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      <ul className="tw:grid tw:grid-cols-3 tw:gap-2">
        {stories.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((story) => (
          <li key={story.mediaPk} className="tw:min-w-0">
            <StoryCard story={story} size="gallery" onOpenStory={onOpenStory} />
          </li>
        ))}
      </ul>
      {pageCount > 1 && (
        <div className="tw:flex tw:items-center tw:justify-between">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("graph.previousStories")}
            disabled={page === 0}
            onClick={() => {
              setPage(page - 1);
            }}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
          <span className="tw:text-xs tw:text-muted-foreground">{`${page + 1} / ${pageCount}`}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("graph.nextStories")}
            disabled={page === pageCount - 1}
            onClick={() => {
              setPage(page + 1);
            }}
          >
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        </div>
      )}
    </section>
  );
}
