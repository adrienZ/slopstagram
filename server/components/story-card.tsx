import { Link } from "@solidjs/meta";
import cx from "clsx";
import { $storyMediaPk } from "../store.ts";
import type { StoryCardViewModel } from "../story-card-view-model.ts";

export function StoryCardStyles() {
  return <Link rel="stylesheet" href="/css/story-card.css" />;
}

export function StoryCard({ story }: { story: StoryCardViewModel }) {
  return (
    <div class={cx("story-slide")}>
      <button
        class={cx("story-image-button")}
        type="button"
        aria-label={`Ouvrir aperçu ${story.mediaPk}`}
        onClick={() => {
          $storyMediaPk.set(story.mediaPk);
        }}
      >
        <img class={cx("story-preview")} src={story.preview} alt={story.alt} />
      </button>
    </div>
  );
}
