import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { Lightbox } from "../components/lightbox.tsx";
import { MentionConnectionStories } from "../components/mention-connection-stories.tsx";
import { MentionGraph } from "../components/mention-graph.tsx";
import { useMentionGraphSelection } from "../hooks/use-mention-graph-selection.ts";
import type { MentionGraphPageData } from "../loaders/mention-graph.ts";
import { getMentionGraph } from "../query-service.ts";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../shadcn/ui/empty.tsx";

export function MentionGraphPage({ points, connections, stories }: MentionGraphPageData) {
  const selection = useMentionGraphSelection({ points, connections, stories });
  const { selectedConnection } = selection;
  return (
    <>
      <header className="tw:flex tw:h-14 tw:shrink-0 tw:items-center tw:gap-3 tw:border-b tw:px-4">
        <a
          href="/report"
          className="tw:flex tw:items-center tw:gap-1 tw:text-sm tw:text-muted-foreground"
        >
          <ArrowLeftIcon aria-hidden="true" className="tw:size-4" />
          Stories
        </a>
        <h1 className="tw:text-sm tw:font-semibold">Graphe des mentions</h1>
      </header>
      <main className="tw:flex tw:flex-col tw:gap-3 tw:p-4">
        <p className="tw:text-sm tw:text-muted-foreground">
          Chaque ligne relie l’auteur d’une story à une personne qu’un sticker de cette story
          mentionne, sur tout l’historique conservé. Une mention ne prouve pas que deux personnes se
          connaissent.
        </p>
        {connections.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Aucune mention à afficher</EmptyTitle>
              <EmptyDescription>
                Une connexion apparaît dès qu’une story mentionne une autre personne.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <MentionGraph
            points={points}
            connections={connections}
            selectedPointId={selection.selectedPointId}
            onSelectPoint={selection.selectPoint}
            selectedConnectionId={selectedConnection?.id ?? null}
            onSelectConnection={selection.selectConnection}
          >
            {selectedConnection !== undefined && (
              <MentionConnectionStories
                key={selectedConnection.id}
                labels={selectedConnection.labels}
                stories={selection.connectionStories}
                onClose={selection.closeConnection}
                onOpenStory={selection.openStory}
              />
            )}
          </MentionGraph>
        )}
      </main>
      <Lightbox
        stories={selection.connectionStories}
        selectedStory={selection.openStoryPk}
        linkToProfile
        onSelectStory={selection.openStory}
      />
    </>
  );
}

export const Route = createFileRoute("/graph")({
  loader: async () => await getMentionGraph(),
  head: () => ({ meta: [{ title: "Graphe des mentions" }] }),
  component: () => <MentionGraphPage {...Route.useLoaderData()} />,
});
