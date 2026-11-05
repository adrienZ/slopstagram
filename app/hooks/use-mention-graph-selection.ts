import { useState } from "react";
import type { MentionGraphPageData } from "../loaders/mention-graph.ts";

/** Point, evidence and modal selection remain transient and independent of the URL. */
export function useMentionGraphSelection({
  nodes,
  connections,
  stories,
}: Pick<MentionGraphPageData, "nodes" | "connections" | "stories">) {
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>();
  const [selectedStory, setSelectedStory] = useState<string>();
  const selectedConnection = connections.find(({ id }) => id === selectedConnectionId);
  // A filtered-out point or connection must not reopen when the filter is cleared.
  if (selectedNodeId !== undefined && !nodes.some(({ id }) => id === selectedNodeId)) {
    setSelectedNodeId(undefined);
  }
  if (selectedConnectionId !== undefined && selectedConnection === undefined) {
    setSelectedConnectionId(undefined);
    setSelectedStory(undefined);
  }
  const storyById = new Map(stories.map((story) => [story.mediaPk, story]));
  const connectionStories =
    selectedConnection?.storyIds.flatMap((id) => {
      const story = storyById.get(id);
      return story === undefined ? [] : [story];
    }) ?? [];
  const labels = new Map(nodes.map(({ id, label }) => [id, label]));
  return {
    selectedNodeId,
    selectedConnection,
    connectionStories,
    connectionLabel:
      selectedConnection === undefined
        ? ""
        : `${labels.get(selectedConnection.source)} · ${labels.get(selectedConnection.target)}`,
    selectedStory,
    selectStory: setSelectedStory,
    selectConnection: (id: string) => {
      setSelectedConnectionId(id);
      setSelectedStory(undefined);
    },
    closeConnection: () => {
      setSelectedConnectionId(undefined);
      setSelectedStory(undefined);
    },
    selectNode: (id?: string) => {
      setSelectedNodeId(id);
      if (id !== undefined) {
        setSelectedConnectionId(undefined);
        setSelectedStory(undefined);
      }
    },
  };
}
