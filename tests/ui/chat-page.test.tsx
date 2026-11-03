import { afterEach, expect, test, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { Route } from "../../app/routes/chat.tsx";
import { loadChatPage } from "../../app/loaders/chat.ts";
import { createChatResponse } from "../../server/routes/api/chat.post.ts";
import { chatAnswer, fakeChatOllama } from "../chat-ollama.ts";
import { createPageRenderer } from "../render-page.ts";
import { useSharedTestRuntime } from "../setup/test-runtime.ts";
import {
  namedAccount,
  outsideFeedAccount,
  pageNow,
  seedPageDatabase,
  userSummary,
} from "./seeded-pages.ts";

const shared = useSharedTestRuntime(seedPageDatabase, { fetchOllama: fakeChatOllama });
const renderer = createPageRenderer(Route, () => loadChatPage(shared.runtime), "/chat");

afterEach(() => {
  vi.unstubAllGlobals();
});

test("typing @ suggests saved accounts and picking one completes the mention", async () => {
  const { user } = await renderer.mountRoute("/chat");
  const input = screen.getByRole("textbox", { name: "Message" });
  await user.type(input, `Que fait @${outsideFeedAccount.slice(0, 8)}`);
  const suggestions = within(screen.getByRole("list", { name: "Suggestions de mentions" }));
  expect(
    suggestions.queryByRole("button", { name: new RegExp(`@${namedAccount.username}$`, "u") }),
  ).not.toBeInTheDocument();
  await user.click(suggestions.getByRole("button", { name: `@${outsideFeedAccount}` }));
  expect(input).toHaveValue(`Que fait @${outsideFeedAccount} `);
  // The picked account is painted like a sticker behind the field.
  expect(screen.getByText(`@${outsideFeedAccount}`, { selector: "mark" })).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Suggestions de mentions" })).not.toBeInTheDocument();
});

test("a message with a mention goes through the chat route and shows the reasoning, the tool and the answer", async () => {
  // The browser's fetch is the boundary: the request reaches the real chat route.
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new globalThis.URL(input, "http://localhost");
    return await createChatResponse(shared.runtime, new globalThis.Request(url, init), pageNow);
  });
  const { user } = await renderer.mountRoute("/chat");
  await user.type(
    screen.getByRole("textbox", { name: "Message" }),
    `Que fait @${namedAccount.username} ?`,
  );
  await user.click(screen.getByRole("button", { name: "Envoyer" }));
  expect(await screen.findByText(chatAnswer)).toBeVisible();
  expect(screen.getByText("Outil : Résumé des dernières 24 heures")).toBeVisible();
  // The mention in the sent message is a sticker linking to the account.
  expect(screen.getByRole("link", { name: `@${namedAccount.username}` })).toHaveAttribute(
    "href",
    `/users/${namedAccount.username}`,
  );
  expect(screen.getByText("Je dois lire le résumé du compte.")).toBeInTheDocument();
  expect(screen.queryByText(userSummary)).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
});

test("listing the accounts shows every saved account as a sticker", async () => {
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new globalThis.URL(input, "http://localhost");
    return await createChatResponse(shared.runtime, new globalThis.Request(url, init), pageNow);
  });
  const { user } = await renderer.mountRoute("/chat");
  await user.type(screen.getByRole("textbox", { name: "Message" }), "Liste les comptes{Enter}");
  const accounts = within(await screen.findByRole("list", { name: "Comptes" }));
  expect(accounts.getAllByRole("listitem")).toHaveLength(loadChatPage(shared.runtime).users.length);
  expect(accounts.getByRole("link", { name: `@${outsideFeedAccount}` })).toHaveAttribute(
    "href",
    `/users/${outsideFeedAccount}`,
  );
});

test("an unreachable chat route is reported and an empty message is not sent", async () => {
  const send = vi.fn(async () => await Promise.reject(new Error("offline")));
  vi.stubGlobal("fetch", send);
  const { user } = await renderer.mountRoute("/chat");
  await user.click(screen.getByRole("button", { name: "Envoyer" }));
  expect(send).not.toHaveBeenCalled();
  await user.type(screen.getByRole("textbox", { name: "Message" }), "Bonjour{Enter}");
  expect(await screen.findByRole("alert")).toHaveTextContent("Le modèle n’a pas répondu.");
});
