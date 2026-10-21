import { createFileRoute } from "@tanstack/react-router";
import { ChatWorkspace } from "../components/chat/chat-workspace.tsx";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat · Slopstagram" },
      { name: "description", content: "A little space to think, create, and find your next idea." },
    ],
    links: [
      { rel: "stylesheet", href: "/css/chat.css" },
      { rel: "icon", type: "image/svg+xml", href: "/chat-mark.svg" },
    ],
  }),
  component: ChatWorkspace,
});
