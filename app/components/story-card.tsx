import { useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import type { StoryCardViewModel } from "../story-card-view-model.ts";

const previewSizes = {
  timeline:
    "tw:w-52.5 tw:max-w-[calc(55vw-36px)] tw:max-[760px]:w-[72vw] tw:max-[760px]:max-w-none",
  feed: "tw:w-30 tw:max-w-[calc(32vw-18px)] tw:max-[760px]:w-[40vw] tw:max-[760px]:max-w-none",
  sticker: "tw:h-[calc(64px*2/3)] tw:w-6 tw:max-w-none tw:object-contain",
  gallery: "tw:aspect-[9/14] tw:w-full tw:object-cover",
};

export function StoryCard({
  story,
  size = "timeline",
}: {
  story: StoryCardViewModel;
  size?: "timeline" | "feed" | "sticker" | "gallery";
}) {
  const navigate = useNavigate();
  return (
    <div className="tw:min-w-0 tw:flex-none tw:snap-start">
      <button
        data-story-preview={story.mediaPk}
        className={cn(
          "tw:cursor-zoom-in tw:border-0 tw:bg-transparent tw:p-0",
          size === "gallery" &&
            "tw:block tw:w-full tw:overflow-hidden tw:rounded-md tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-ring",
        )}
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
          className={cn("tw:block tw:rounded-lg tw:shadow-[0_1px_3px_#0003]", previewSizes[size])}
          src={story.preview}
          alt={story.alt}
          loading={size === "gallery" ? "lazy" : undefined}
          decoding="async"
        />
      </button>
    </div>
  );
}
