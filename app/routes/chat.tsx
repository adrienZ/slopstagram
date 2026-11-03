import { createFileRoute } from "@tanstack/react-router";
import { ChatPanel } from "../components/chat-panel.tsx";
import type { ChatPageData } from "../loaders/chat.ts";
import { getChatPage } from "../query-service.ts";

export function ChatPage({ users }: ChatPageData) {
  return (
    <>
      <header className="tw:flex tw:h-14 tw:items-center tw:gap-3 tw:border-b tw:px-4">
        <a href="/report" className="tw:text-sm tw:text-muted-foreground">
          ← Stories
        </a>
        <h1 className="tw:text-sm tw:font-semibold">Assistant</h1>
      </header>
      <ChatPanel users={users} />
    </>
  );
}

export const Route = createFileRoute("/chat")({
  loader: async () => await getChatPage(),
  head: () => ({ meta: [{ title: "Assistant" }] }),
  component: () => <ChatPage {...Route.useLoaderData()} />,
});
