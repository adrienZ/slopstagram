import { useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import type { StoryCardViewModel } from "../story-card-view-model.ts";

export function StoryCard({
  story,
  compact = false,
}: {
  story: StoryCardViewModel;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <div className="tw:flex-none tw:snap-start">
      <button
        data-story-preview={story.mediaPk}
        className="tw:cursor-zoom-in tw:border-0 tw:bg-transparent tw:p-0"
        type="button"
        aria-label={`Ouvrir aperçu ${story.mediaPk}`}
        onClick={() => {
          void navigate({
            to: ".",
            search: (previous) => ({ ...previous, story: story.mediaPk }),
            replace: true,
            resetScroll: false,
          });
        }}
      >
        <img
          className={cn(
            "tw:block tw:rounded-lg tw:shadow-[0_1px_3px_#0003]",
            compact
              ? "tw:h-8 tw:w-4.5 tw:max-w-none tw:object-contain"
              : "tw:w-52.5 tw:max-w-[calc(55vw-36px)] tw:max-[760px]:w-[72vw] tw:max-[760px]:max-w-none",
          )}
          src={story.preview}
          alt={story.alt}
        />
      </button>
    </div>
  );
}
