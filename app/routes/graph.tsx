import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useState } from "react";
import { MentionGraphCanvas } from "../components/mention-graph-canvas.tsx";
import type { MentionGraphPageData } from "../loaders/mention-graph.ts";
import { getMentionGraph } from "../query-service.ts";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "../shadcn/ui/empty.tsx";

export function MentionGraphPage({ nodes, connections }: MentionGraphPageData) {
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
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
      <main className="tw:flex tw:min-h-[calc(100dvh-3.5rem)] tw:flex-col tw:gap-3 tw:p-4">
        <p className="tw:text-sm tw:text-muted-foreground">
          Mentions observées dans les stories conservées. Une mention ne prouve pas que deux
          personnes se connaissent. Glissez un point ou le fond pour explorer.
        </p>
        {connections.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Aucune connexion à afficher.</EmptyTitle>
              <EmptyDescription>
                Les connexions apparaissent lorsqu’une story mentionne un autre compte.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <MentionGraphCanvas
            nodes={nodes}
            connections={connections}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
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
