import { useTranslation } from "react-i18next";
import { i18n } from "../i18n/index.ts";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { ChatPanel } from "../components/chat-panel.tsx";
import type { ChatPageData } from "../loaders/chat.ts";
import { getChatPage } from "../query-service.ts";

export function ChatPage({ accounts }: ChatPageData) {
  const { t } = useTranslation();

  return (
    <>
      <header className="tw:flex tw:h-14 tw:shrink-0 tw:items-center tw:gap-3 tw:border-b tw:px-4">
        <Link
          to="/report"
          className="tw:flex tw:items-center tw:gap-1 tw:text-sm tw:text-muted-foreground"
        >
          <ArrowLeftIcon aria-hidden="true" className="tw:size-4" />
          {t("common.stories")}
        </Link>
        <h1 className="tw:text-sm tw:font-semibold">{t("common.assistant")}</h1>
      </header>
      <ChatPanel accounts={accounts} />
    </>
  );
}

function ChatRoute() {
  const { accounts } = Route.useLoaderData();

  return <ChatPage accounts={accounts} />;
}

export const Route = createFileRoute("/chat")({
  loader: async () => await getChatPage(),
  head: () => ({ meta: [{ title: i18n.t("common.assistant") }] }),
  component: ChatRoute,
});
