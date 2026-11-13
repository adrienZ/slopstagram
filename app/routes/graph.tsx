import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { z } from "zod";
import { AccountFilter } from "../components/account-filter.tsx";
import { ErrorToast } from "../components/error-toast.tsx";
import { Lightbox } from "../components/lightbox.tsx";
import { MentionConnectionStories } from "../components/mention-connection-stories.tsx";
import { MentionGraph } from "../components/mention-graph.tsx";
import { useTheme } from "../components/theme-provider.tsx";
import { useMentionGraphFilter } from "../hooks/use-mention-graph-filter.ts";
import { useMentionGraphSelection } from "../hooks/use-mention-graph-selection.ts";
import type { MentionGraphPageData } from "../loaders/mention-graph.ts";
import { getMentionGraph } from "../query-service.ts";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../shadcn/ui/empty.tsx";
import { Toaster } from "../shadcn/ui/sonner.tsx";
import { formatUserHandle } from "../utils/helper.ts";
import { parseAccountFilters } from "../utils/mention-graph-search.ts";

function MentionGraphExplorer({
  points,
  connections,
  stories,
}: Pick<MentionGraphPageData, "points" | "connections" | "stories">) {
  const selection = useMentionGraphSelection({ points, connections, stories });
  const { selectedConnection } = selection;
  return (
    <>
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
      <Lightbox
        stories={selection.connectionStories}
        selectedStory={selection.openStoryPk}
        linkToProfile
        onSelectStory={selection.openStory}
      />
    </>
  );
}

function formatUnknownAccounts(usernames: Array<string>): string {
  const handles = usernames.map((username) => formatUserHandle(username)).join(", ");
  return `${usernames.length > 1 ? "Comptes absents" : "Compte absent"} du graphe : ${handles}. Le graphe complet est affiché.`;
}

export function MentionGraphPage({
  accounts,
  selectedAccounts,
  unknownAccounts,
  ...graph
}: MentionGraphPageData) {
  const filter = useMentionGraphFilter(selectedAccounts);
  const { theme } = useTheme();
  const unknownAccountsMessage =
    unknownAccounts.length > 0 ? formatUnknownAccounts(unknownAccounts) : undefined;
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
        {graph.connections.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Aucune mention à afficher</EmptyTitle>
              <EmptyDescription>
                Une connexion apparaît dès qu’une story mentionne une autre personne.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="tw:relative">
            {/* A new filter draws another graph: its layout, view and selection start over. */}
            <MentionGraphExplorer key={selectedAccounts.join(",")} {...graph} />
            <div className="tw:absolute tw:top-3 tw:left-3">
              <AccountFilter
                accounts={accounts}
                selected={selectedAccounts}
                onToggle={filter.toggle}
                onClear={filter.clear}
              />
            </div>
          </div>
        )}
      </main>
      <Toaster theme={theme} />
      {unknownAccountsMessage !== undefined && (
        <ErrorToast key={unknownAccountsMessage} message={unknownAccountsMessage} />
      )}
    </>
  );
}

export const Route = createFileRoute("/graph")({
  validateSearch: z.object({ accounts: z.string().optional() }),
  loaderDeps: ({ search }) => ({ accounts: parseAccountFilters(search.accounts) }),
  loader: async ({ deps }) => await getMentionGraph({ data: deps }),
  head: () => ({ meta: [{ title: "Graphe des mentions" }] }),
  component: () => <MentionGraphPage {...Route.useLoaderData()} />,
});
