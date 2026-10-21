/* oxlint-disable oxc/no-this-in-exported-function -- mono-jsx binds `this` to the component's signal scope. */
import cx from "clsx";
import { css } from "mono-jsx/jsx-runtime";
import type { StoryCardViewModel } from "../story-card-view-model.ts";
import { serializeSignalData } from "../signal-json.ts";
import type { LightboxSignals } from "./lightbox.tsx";

export const storyCardStyles = css`
  .story-slide {
    flex: none;
    scroll-snap-align: start;
  }

  .story-image-button {
    border: 0;
    padding: 0;
    background: transparent;
    cursor: zoom-in;
  }

  .story-preview {
    width: 210px;
    max-width: calc(55vw - 36px);
    border-radius: 8px;
    display: block;
    box-shadow: 0 1px 3px #0003;
  }

  @media (max-width: 760px) {
    .story-preview {
      width: 72vw;
      max-width: none;
    }
  }
`;

export function StoryCardStyles() {
  return <style>{storyCardStyles}</style>;
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
