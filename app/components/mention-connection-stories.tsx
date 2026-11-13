import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { StoryCardData } from "../utils/story-cards.ts";
import { Button } from "../shadcn/ui/button.tsx";
import { StoryCard } from "./story-card.tsx";

const PAGE_SIZE = 3;

/** The thumbnails of a Mention connection's source stories, three at a time. */
export function MentionConnectionStories({
  labels,
  stories,
  onClose,
  onOpenStory,
}: {
  /** The labels of the connection's two points. */
  labels: [string, string];
  stories: Array<StoryCardData>;
  onClose: () => void;
  onOpenStory: (mediaPk: string) => void;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(stories.length / PAGE_SIZE);
  const title = `Stories de la connexion entre ${labels.join(" et ")}`;
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
          aria-label="Fermer les stories de la connexion"
          onClick={onClose}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      <ul className="tw:grid tw:grid-cols-3 tw:gap-2">
        {stories.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((story) => (
          <li key={story.mediaPk} className="tw:min-w-0">
            <StoryCard story={story} size="gallery" onOpen={onOpenStory} />
          </li>
        ))}
      </ul>
      {pageCount > 1 && (
        <div className="tw:flex tw:items-center tw:justify-between">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Stories précédentes"
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
            aria-label="Stories suivantes"
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
