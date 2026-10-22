import { useNavigate } from "@tanstack/react-router";
import cx from "clsx";
import type { StoryCardViewModel } from "../story-card-view-model.ts";

export function StoryCard({ story }: { story: StoryCardViewModel }) {
  const navigate = useNavigate();
  return (
    <div className={cx("story-slide")}>
      <button
        className={cx("story-image-button")}
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
        <img className={cx("story-preview")} src={story.preview} alt={story.alt} />
      </button>
    </div>
  );
}
