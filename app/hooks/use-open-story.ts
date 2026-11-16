import { useNavigate } from "@tanstack/react-router";
import { replaceViewSearch } from "../search-params.ts";

export type OpenStory = (mediaPk?: string) => void;

/** The open story lives in the `story` search param, unless the page keeps it in its own state. */
export function useOpenStory(onOpenStory?: OpenStory): OpenStory {
  const navigate = useNavigate();

  return (
    onOpenStory ??
    ((mediaPk) => {
      void navigate({
        ...replaceViewSearch,
        search: (previous) => ({ ...previous, story: mediaPk }),
      });
    })
  );
}
