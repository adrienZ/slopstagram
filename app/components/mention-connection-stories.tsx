import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { StoryCardData } from "../utils/story-cards.ts";
import { Button } from "../shadcn/ui/button.tsx";
import { Popover, PopoverAnchor, PopoverContent } from "../shadcn/ui/popover.tsx";
import { StoryCard } from "./story-card.tsx";

const PAGE_SIZE = 3;

/** Three source story thumbnails, anchored over the graph's bottom-right corner. */
export function MentionConnectionStories({
  label,
  stories,
  onClose,
  onOpenStory,
}: {
  label: string;
  stories: Array<StoryCardData>;
  onClose: () => void;
  onOpenStory: (mediaPk: string) => void;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(stories.length / PAGE_SIZE));
  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <PopoverAnchor asChild>
        <span className="tw:pointer-events-none tw:absolute tw:right-3 tw:bottom-20" />
      </PopoverAnchor>
      <PopoverContent
        aria-label="Stories de la connexion"
        align="end"
        side="top"
        className="tw:w-72 tw:max-w-[calc(100vw-3rem)]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
      >
        <div className="tw:flex tw:flex-col tw:gap-3">
          <div className="tw:flex tw:items-center tw:justify-between tw:gap-2">
            <h2 className="tw:min-w-0 tw:text-sm tw:font-medium tw:wrap-anywhere">{label}</h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Fermer les stories de la connexion"
              onClick={onClose}
            >
              <XIcon data-icon="inline-start" />
            </Button>
          </div>
          {stories.length === 0 ? (
            <p className="tw:text-sm tw:text-muted-foreground">Aucun aperçu disponible.</p>
          ) : (
            <ul className="tw:grid tw:grid-cols-3 tw:gap-2">
              {stories.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((story) => (
                <li key={story.mediaPk} className="tw:min-w-0">
                  <StoryCard story={story} size="gallery" onOpen={onOpenStory} />
                </li>
              ))}
            </ul>
          )}
          <div className="tw:flex tw:items-center tw:justify-between tw:gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Stories précédentes"
              disabled={page === 0}
              onClick={() => {
                setPage(page - 1);
              }}
            >
              <ChevronLeftIcon data-icon="inline-start" />
            </Button>
            <span aria-live="polite" className="tw:text-xs tw:text-muted-foreground">
              {page + 1} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Stories suivantes"
              disabled={page + 1 >= pageCount}
              onClick={() => {
                setPage(page + 1);
              }}
            >
              <ChevronRightIcon data-icon="inline-start" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
