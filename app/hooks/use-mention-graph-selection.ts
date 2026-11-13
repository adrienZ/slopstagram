import { useMemo, useState } from "react";
import type { MentionGraphPageData } from "../loaders/mention-graph.ts";

type GraphConnection = MentionGraphPageData["connections"][number];

function labelsOf(
  points: MentionGraphPageData["points"],
  { source, target }: GraphConnection,
): [string, string] {
  const labelById = new Map(points.map(({ id, label }) => [id, label]));
  return [labelById.get(source) ?? source, labelById.get(target) ?? target];
}

/**
 * The graph's selected point, the connection whose source stories are shown, and the story open
 * in the modal. None of them is in the URL, so a refresh closes them all. Selecting another point
 * closes the shown connection, so its stories never stay beside an unrelated selection.
 */
export function useMentionGraphSelection({
  points,
  connections,
  stories,
}: Pick<MentionGraphPageData, "points" | "connections" | "stories">) {
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [openStoryPk, setOpenStoryPk] = useState<string>();
  const storyByPk = useMemo(
    () => new Map(stories.map((story) => [story.mediaPk, story])),
    [stories],
  );
  const selectedConnection = connections.find(({ id }) => id === selectedConnectionId);

  function closeConnection() {
    setSelectedConnectionId(null);
    setOpenStoryPk(undefined);
  }

  return {
    selectedPointId,
    selectPoint: (id: string | null) => {
      setSelectedPointId(id);
      if (id !== null) {
        closeConnection();
      }
    },
    selectedConnection:
      selectedConnection === undefined
        ? undefined
        : { id: selectedConnection.id, labels: labelsOf(points, selectedConnection) },
    connectionStories:
      selectedConnection?.storyPks.flatMap((storyPk) => storyByPk.get(storyPk) ?? []) ?? [],
    selectConnection: (id: string) => {
      setSelectedConnectionId(id);
      setOpenStoryPk(undefined);
    },
    closeConnection,
    openStoryPk,
    openStory: setOpenStoryPk,
  };
}
