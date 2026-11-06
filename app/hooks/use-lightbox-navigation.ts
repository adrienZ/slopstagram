import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { StoryCardData } from "../utils/story-cards.ts";

/**
 * The story shown by the lightbox lives in the `story` search param: closing clears it, and
 * stepping selects the previous or next story, wrapping around.
 */
export function useLightboxNavigation(stories: Array<StoryCardData>, story: StoryCardData) {
  const navigateTo = useNavigate();
  const [dismissedStory, setDismissedStory] = useState<string | null>(null);

  function close() {
    setDismissedStory(story.mediaPk);
    void navigateTo({
      to: ".",
      search: (previous) => ({ ...previous, story: undefined }),
      replace: true,
      resetScroll: false,
    });
  }

  function navigate(direction: number) {
    const index = stories.findIndex((entry) => entry.mediaPk === story.mediaPk);
    void navigateTo({
      to: ".",
      search: (previous) => ({
        ...previous,
        story: stories[(index + direction + stories.length) % stories.length]?.mediaPk,
      }),
      replace: true,
      resetScroll: false,
    });
  }

  return { close, navigate, isOpen: dismissedStory !== story.mediaPk };
}
