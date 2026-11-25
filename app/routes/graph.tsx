import { useTranslation } from "react-i18next";
import { i18n } from "../i18n/index.ts";
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
  const { t } = useTranslation();

  function handleToggle(username: string) {
    filter.toggle(username);
  }

  function handleClear() {
    filter.clear();
  }

  return (
    <>
      <header className="tw:flex tw:h-14 tw:shrink-0 tw:items-center tw:gap-3 tw:border-b tw:px-4">
        <a
          href="/report"
          className="tw:flex tw:items-center tw:gap-1 tw:text-sm tw:text-muted-foreground"
        >
          <ArrowLeftIcon aria-hidden="true" className="tw:size-4" />
          {t("common.stories")}
        </a>
        <h1 className="tw:text-sm tw:font-semibold">{t("graph.title")}</h1>
      </header>
      <main className="tw:flex tw:flex-col tw:gap-3 tw:p-4">
        <p className="tw:text-sm tw:text-muted-foreground">{t("graph.intro")}</p>
        {graph.connections.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("graph.emptyTitle")}</EmptyTitle>
              <EmptyDescription>{t("graph.emptyDescription")}</EmptyDescription>
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
                onToggle={handleToggle}
                onClear={handleClear}
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

function MentionGraphRoute() {
  const { accounts, selectedAccounts, unknownAccounts, graph } = Route.useLoaderData();

  return (
    <MentionGraphPage
      accounts={accounts}
      selectedAccounts={selectedAccounts}
      unknownAccounts={unknownAccounts}
      graph={graph}
    />
  );
}

export const Route = createFileRoute("/graph")({
  validateSearch: z.object({ accounts: z.string().optional() }),
  loaderDeps: ({ search }) => ({ accounts: parseAccountFilters(search.accounts) }),
  loader: async ({ deps }) => await getMentionGraph({ data: deps }),
  head: () => ({ meta: [{ title: i18n.t("graph.title") }] }),
  component: MentionGraphRoute,
});
