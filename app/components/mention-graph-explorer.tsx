import { useMentionGraphSelection } from "../hooks/use-mention-graph-selection.ts";
import type { MentionGraphPageData } from "../loaders/mention-graph.ts";
import { Lightbox } from "./lightbox.tsx";
import { MentionConnectionStories } from "./mention-connection-stories.tsx";
import { MentionGraph } from "./mention-graph.tsx";

export function MentionGraphExplorer(graph: MentionGraphPageData["graph"]) {
  const { points, connections } = graph;
  const selection = useMentionGraphSelection(graph);
  const { selectedConnection } = selection;

  function handleCloseConnection() {
    selection.closeConnection();
  }

  function handleOpenStory(mediaPk?: string) {
    selection.openStory(mediaPk);
  }

  return (
    <>
      <MentionGraph
        points={points}
        connections={connections}
        selection={selection}
        overlay={
          selectedConnection !== undefined && (
            <MentionConnectionStories
              key={selectedConnection.id}
              labels={selectedConnection.labels}
              stories={selection.connectionStories}
              onClose={handleCloseConnection}
              onOpenStory={handleOpenStory}
            />
          )
        }
      />
      <Lightbox
        stories={selection.connectionStories}
        selectedStory={selection.openStoryPk}
        linkToProfile
        onOpenStory={handleOpenStory}
      />
    </>
  );
}
