import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowLeftIcon } from "lucide-react";
import { ChatPanel } from "../components/chat-panel.tsx";
import { loadChatPage, type ChatPageData } from "../loaders/chat.ts";
import { getProductionRuntime } from "@@/core/domains/runtime/production-runtime.ts";

export function ChatPage({ accounts }: ChatPageData) {
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
        <h1 className="tw:text-sm tw:font-semibold">Assistant</h1>
      </header>
      <ChatPanel accounts={accounts} />
    </>
  );
}

function ChatRoute() {
  const { accounts } = Route.useLoaderData();

  return <ChatPage accounts={accounts} />;
}

const getChatPage = createServerFn({ method: "GET" }).handler(() =>
  loadChatPage(getProductionRuntime()),
);

export const Route = createFileRoute("/chat")({
  loader: async () => await getChatPage(),
  head: () => ({ meta: [{ title: "Assistant" }] }),
  component: ChatRoute,
});
