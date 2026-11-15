import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useState } from "react";
import { MentionGraph } from "../components/mention-graph.tsx";
import type { MentionGraphPageData } from "../loaders/mention-graph.ts";
import { getMentionGraph } from "../query-service.ts";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../shadcn/ui/empty.tsx";

export function MentionGraphPage({ points, connections }: MentionGraphPageData) {
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
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
            selectedPointId={selectedPointId}
            onSelectPoint={setSelectedPointId}
          />
        )}
      </main>
    </>
  );
}

export const Route = createFileRoute("/graph")({
  loader: async () => await getMentionGraph(),
  head: () => ({ meta: [{ title: "Graphe des mentions" }] }),
  component: () => <MentionGraphPage {...Route.useLoaderData()} />,
});
