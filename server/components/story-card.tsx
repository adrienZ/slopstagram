/* oxlint-disable oxc/no-this-in-exported-function -- mono-jsx binds `this` to the component's signal scope. */
import { css } from "mono-jsx/jsx-runtime";
import cx from "clsx";
import type { StoryCardViewModel } from "../story-card-view-model.ts";
import { serializeSignalData } from "../signal-json.ts";
import type { LightboxSignals } from "./lightbox.tsx";

export function StoryCardStyles() {
  return (
    <style>{css`
      @import url("/css/story-card.css");
    `}</style>
  );
}

export function StoryCard(
  this: WithAppSignals<FC<{ selectionJson: string }>, LightboxSignals>,
  { story }: { story: StoryCardViewModel },
) {
  this.selectionJson = serializeSignalData({ mediaPk: story.mediaPk });

  return (
    <div class={cx("story-slide")}>
      <button
        class={cx("story-image-button")}
        type="button"
        aria-label={`Ouvrir aperçu ${story.mediaPk}`}
        onClick={() => {
          // oxlint-disable-next-line typescript/no-unsafe-assignment -- The server serialized this card's typed mediaPk into the signal.
          const selection: Pick<StoryCardViewModel, "mediaPk"> = JSON.parse(this.selectionJson);
          this.app.storyMediaPk = selection.mediaPk;
        }}
      >
        <img class={cx("story-preview")} src={story.preview} alt={story.alt} />
      </button>
    </div>
  );
}
