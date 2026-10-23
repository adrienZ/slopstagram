import { useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import type { StoryCardViewModel } from "../story-card-view-model.ts";

export function StoryCard({ story }: { story: StoryCardViewModel }) {
  const navigate = useNavigate();
  return (
    <div className={cn("story-slide")}>
      <button
        data-story-preview={story.mediaPk}
        className={cn("story-image-button")}
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
        <img className={cn("story-preview")} src={story.preview} alt={story.alt} />
      </button>
    </div>
  );
}
