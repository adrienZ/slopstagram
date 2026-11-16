import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { z } from "zod";
import { AccountFilter } from "../components/account-filter.tsx";
import { MentionGraphExplorer } from "../components/mention-graph-explorer.tsx";
import { useTheme } from "../components/theme-provider.tsx";
import { UnknownAccountsToast } from "../components/unknown-accounts-toast.tsx";
import { useMentionGraphFilter } from "../hooks/use-mention-graph-filter.ts";
import type { MentionGraphPageData } from "../loaders/mention-graph.ts";
import { getMentionGraph } from "../query-service.ts";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../shadcn/ui/empty.tsx";
import { Toaster } from "../shadcn/ui/sonner.tsx";
import { formatAccountFilters, parseAccountFilters } from "../search-params.ts";

export function MentionGraphPage({
  accounts,
  selectedAccounts,
  unknownAccounts,
  graph,
}: MentionGraphPageData) {
  const filter = useMentionGraphFilter(selectedAccounts);
  const { theme } = useTheme();

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
            <MentionGraphExplorer key={formatAccountFilters(selectedAccounts)} {...graph} />
            <div className="tw:absolute tw:top-3 tw:left-3">
              <AccountFilter
                accounts={accounts}
                selected={selectedAccounts}
                onToggle={filter.toggle}
                onClear={filter.clear}
                clearable={selectedAccounts.length > 0 || unknownAccounts.length > 0}
              />
            </div>
          </div>
        )}
      </main>
      <Toaster theme={theme} />
      {unknownAccounts.length > 0 && <UnknownAccountsToast usernames={unknownAccounts} />}
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
