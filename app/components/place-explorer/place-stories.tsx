import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import type { TimelinePlace } from "../../utils/timeline-locations.ts";
import type { StoryCardData } from "../../utils/story-cards.ts";
import { formatStickerStoryDate } from "../../utils/timeline-stickers.ts";
import { formatUserHandle, getUserTimelineUrl } from "../../utils/helper.ts";
import { StoryCard } from "../story-card.tsx";

const footerButtonClassName =
  "tw:cursor-pointer tw:rounded tw:p-1 tw:hover:bg-muted tw:focus-visible:outline-2 tw:focus-visible:outline-ring";

/** The body of a place's map popup: its story cards and dates, with previous and next places. */
export function PlaceStories({
  place,
  storyByMediaPk,
  showOwner = false,
  onClose,
  onStep,
}: {
  place: TimelinePlace;
  storyByMediaPk: Map<string, StoryCardData>;
  /** Names each story's owner, linking to their profile. */
  showOwner?: boolean;
  onClose: () => void;
  /** Steps to the previous or next place; absent when there is no other place. */
  onStep?: (step: 1 | -1) => void;
}) {
  return (
    <section
      aria-label={`Stories du lieu : ${place.name}`}
      className="tw:w-56 tw:space-y-1 tw:text-foreground"
    >
      <div className="tw:flex tw:items-start tw:justify-between tw:gap-2">
        <h3 className="tw:min-w-0 tw:text-sm tw:font-semibold tw:wrap-anywhere">{place.name}</h3>
        <button
          type="button"
          aria-label="Fermer les aperçus du lieu"
          className="tw:shrink-0 tw:cursor-pointer tw:rounded tw:p-1 tw:hover:bg-muted tw:focus-visible:outline-2 tw:focus-visible:outline-ring"
          onClick={onClose}
        >
          <XIcon className="tw:size-4" />
        </button>
      </div>
      <ul className="tw:grid tw:max-h-60 tw:grid-cols-3 tw:gap-1.5 tw:overflow-y-auto">
        {place.stories.map((story) => {
          const card = storyByMediaPk.get(story.mediaPk);
          return (
            <li key={story.mediaPk} className="tw:min-w-0 tw:space-y-1">
              {card === undefined ? (
                <span>Preview unavailable</span>
              ) : (
                <StoryCard story={card} size="gallery" />
              )}
              {showOwner && (
                <a
                  href={getUserTimelineUrl(story.username)}
                  className="tw:block tw:truncate tw:text-[10px] tw:font-medium tw:hover:underline"
                >
                  {formatUserHandle(story.username)}
                </a>
              )}
              <time
                className="tw:block tw:text-[10px] tw:text-muted-foreground"
                dateTime={story.date}
              >
                {formatStickerStoryDate(story.date)}
              </time>
            </li>
          );
        })}
      </ul>
      {onStep !== undefined && (
        <div className="tw:flex tw:justify-between">
          <button
            type="button"
            aria-label="Lieu précédent"
            className={footerButtonClassName}
            onClick={() => {
              onStep(-1);
            }}
          >
            <ChevronLeftIcon className="tw:size-4" />
          </button>
          <button
            type="button"
            aria-label="Lieu suivant"
            className={footerButtonClassName}
            onClick={() => {
              onStep(1);
            }}
          >
            <ChevronRightIcon className="tw:size-4" />
          </button>
        </div>
      )}
    </section>
  );
}
