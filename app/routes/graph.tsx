import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { z } from "zod";
import { AccountFilter } from "../components/account-filter.tsx";
import { useMentionGraphFilter } from "../hooks/use-mention-graph-filter.ts";
import { Toaster } from "../shadcn/ui/sonner.tsx";
import { useTheme } from "../components/theme-provider.tsx";
import { MentionGraphCanvas } from "../components/mention-graph-canvas.tsx";
import { MentionConnectionStories } from "../components/mention-connection-stories.tsx";
import { Lightbox } from "../components/lightbox.tsx";
import { useMentionGraphSelection } from "../hooks/use-mention-graph-selection.ts";
import type { MentionGraphPageData } from "../loaders/mention-graph.ts";
import { getMentionGraph } from "../query-service.ts";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "../shadcn/ui/empty.tsx";

export function MentionGraphPage({
  selectedAccounts,
  ...data
}: MentionGraphPageData & { selectedAccounts?: string }) {
  const filter = useMentionGraphFilter(data, selectedAccounts);
  const { theme } = useTheme();
  const selection = useMentionGraphSelection({ ...filter, stories: data.stories });
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
        <div className="tw:relative">
          {filter.connections.length === 0 ? (
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
              nodes={filter.nodes}
              connections={filter.connections}
              selectedNodeId={selection.selectedNodeId}
              selectedConnectionId={selection.selectedConnection?.id}
              onSelectNode={selection.selectNode}
              onSelectConnection={selection.selectConnection}
            />
          )}
          {selection.selectedConnection !== undefined && (
            <MentionConnectionStories
              key={selection.selectedConnection.id}
              label={selection.connectionLabel}
              stories={selection.connectionStories}
              onClose={selection.closeConnection}
              onOpenStory={selection.selectStory}
            />
          )}
          <div className="tw:absolute tw:top-3 tw:left-3">
            <AccountFilter
              accounts={filter.accounts}
              selected={filter.selected}
              onToggle={filter.toggle}
              onClear={filter.clear}
            />
          </div>
        </div>
        <div ref={filter.bindNotification}>
          <Toaster theme={theme} position="top-right" closeButton />
        </div>
      </main>
      <Lightbox
        stories={selection.connectionStories}
        selectedStory={selection.selectedStory}
        onSelectStory={selection.selectStory}
        linkToProfile
      />
    </>
  );
}

export const Route = createFileRoute("/graph")({
  validateSearch: z.object({ accounts: z.string().optional() }),
  loader: async () => await getMentionGraph(),
  head: () => ({ meta: [{ title: "Graphe des mentions" }] }),
  component: () => (
    <MentionGraphPage {...Route.useLoaderData()} selectedAccounts={Route.useSearch().accounts} />
  ),
});
