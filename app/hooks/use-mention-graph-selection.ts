import { useMemo, useState } from "react";
import type { MentionGraphPageData } from "../loaders/mention-graph.ts";

/**
 * Kept out of the URL, so a refresh closes everything. Selecting a point closes the shown
 * connection, so its stories never sit beside an unrelated selection. A point with a single
 * connection has nothing to choose between, so selecting it opens that connection's stories.
 */
export function useMentionGraphSelection({ connections, stories }: MentionGraphPageData["graph"]) {
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [openStoryPk, setOpenStoryPk] = useState<string>();

  const storyByPk = useMemo(
    () => new Map(stories.map((story) => [story.mediaPk, story])),
    [stories],
  );

  const selectedConnection = connections.find(({ id }) => id === selectedConnectionId);

  const connectionStories =
    selectedConnection?.storyPks.flatMap((storyPk) => storyByPk.get(storyPk) ?? []) ?? [];

  function closeConnection() {
    setSelectedConnectionId(null);
    setOpenStoryPk(undefined);
  }

  return {
    selectedPointId,
    selectPoint: (id: string | null) => {
      setSelectedPointId(id);

      if (id === null) {
        return;
      }

      const own = connections.filter(({ source, target }) => source === id || target === id);

      if (own.length === 1) {
        setSelectedConnectionId(own[0].id);
        setOpenStoryPk(undefined);
      } else {
        closeConnection();
      }
    },
    selectedConnectionId: selectedConnection?.id ?? null,
    selectedConnection,
    connectionStories: connectionStories.map((story, index) => ({
      ...story,
      position: index + 1,
      count: connectionStories.length,
    })),
    selectConnection: (id: string) => {
      setSelectedConnectionId(id);
      setOpenStoryPk(undefined);
    },
    closeConnection,
    openStoryPk,
    openStory: setOpenStoryPk,
  };
}

export type MentionGraphSelection = ReturnType<typeof useMentionGraphSelection>;
