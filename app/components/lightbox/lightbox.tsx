import type { StoryCardData } from "../../utils/story-cards.ts";
import { LightboxDialog } from "./lightbox-dialog.tsx";

interface LightboxProps {
  stories: Array<StoryCardData>;
  selectedStory?: string;
  linkToProfile?: boolean;
}

export function Lightbox(props: LightboxProps) {
  const story = props.stories.find((entry) => entry.mediaPk === props.selectedStory);
  return story === undefined ? null : (
    <LightboxDialog
      stories={props.stories}
      story={story}
      linkToProfile={props.linkToProfile ?? false}
    />
  );
}
