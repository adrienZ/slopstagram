import { afterEach, beforeEach, expect, test, vi, type TestContext } from "vitest";
import { screen, within } from "@testing-library/react";
import { Route } from "../../app/routes/chat.tsx";
import { loadChatPage } from "../../app/loaders/chat.ts";
import { handleChatRequest } from "../../app/routes/api/chat.ts";
import { createPageRenderer } from "../render-page.ts";
import { assistantGreeting, assistantThinking, createWorld, now } from "../setup/report-world.ts";

beforeEach(() => {
  // The Assistant reads the story feed of the current time.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Mounts the chat page over a fetched world. The browser's fetch is the boundary: the page's
 * chat requests reach the real chat route handler, which waits for the gate `hold` returns.
 */
async function mountChat(world: Awaited<ReturnType<typeof createWorld>>) {
  let gate: PromiseWithResolvers<void> | undefined;
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    await gate?.promise;
    const url = new globalThis.URL(input, "http://localhost");
    return await handleChatRequest(world.runtime, new globalThis.Request(url, init));
  });
  const page = await createPageRenderer(Route, loadChatPage(world), "/chat").mountRoute("/chat");
  return {
    ...page,
    hold: () => {
      gate = Promise.withResolvers();
      return gate;
    },
    ask: async (text: string) => {
      await page.user.type(screen.getByRole("textbox", { name: "Message" }), text);
      await page.user.click(screen.getByRole("button", { name: "Envoyer" }));
    },
  };
}

async function fetchedWorld(context: TestContext, options: Parameters<typeof createWorld>[1] = {}) {
  const world = await createWorld(context, options);
  await world.run();
  return world;
}

test("asking about an account traces the read, then renders the written answer", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  const gate = chat.hold();
  await chat.ask("What did @user_072 post today?");
  // The thread shows the question and the send button waits for the answer.
  expect(screen.getByText("What did @user_072 post today?")).toBeVisible();
  expect(screen.getByRole("button", { name: "Envoyer" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
  gate.resolve();

  const bold = await screen.findByText("answer");
  // The model writes markdown: the chat renders it instead of showing its marks.
  expect(bold.tagName).toBe("STRONG");
  expect(screen.getByText("Lecture du résumé de @user_072")).toBeVisible();
  // Its mentions are the stickers of the story feed.
  const sticker = screen.getByRole("link", { name: "@user_072" });
  expect(sticker).toHaveAttribute("href", "/users/user_072");
  expect(sticker.querySelector("img")).toHaveAttribute("src", "/media/avatars/700000000000068.jpg");
  // The reasoning is available, collapsed.
  const [reasoning] = screen.getAllByRole("button", { name: "Raisonnement" });
  expect(reasoning).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText(assistantThinking)).not.toBeInTheDocument();
  await chat.user.click(reasoning);
  expect(screen.getByText(assistantThinking)).toBeVisible();
  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Envoyer" })).toBeEnabled());
});

test("several accounts trace one read of their summaries", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  await chat.ask("Are @user_072 and @user_999 together?");

  await screen.findByText("answer");
  expect(screen.getByText("Lecture des résumés de @user_072, @user_999")).toBeVisible();
});

test("asking which accounts are saved renders every saved account as a mention sticker", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  await chat.ask("Quels comptes connais-tu ?");

  const answer = await screen.findByText("answer");
  const list = screen.getByRole("list", { name: "Comptes enregistrés" });
  const stickers = within(list).getAllByRole("link");
  expect(stickers.map((sticker) => sticker.textContent)).toStrictEqual(["@user_008", "@user_072"]);
  expect(stickers.map((sticker) => sticker.getAttribute("href"))).toStrictEqual([
    "/users/user_008",
    "/users/user_072",
  ]);
  expect(
    stickers.map((sticker) => sticker.querySelector("img")?.getAttribute("src")),
  ).toStrictEqual(["/media/avatars/700000000000001.jpg", "/media/avatars/700000000000068.jpg"]);
  expect(list.compareDocumentPosition(answer)).toBe(globalThis.Node.DOCUMENT_POSITION_FOLLOWING);
});

test("asking which accounts are saved before any fetch run says none is saved", async (context) => {
  const chat = await mountChat(await createWorld(context));

  await chat.ask("Which accounts are saved?");

  await screen.findByText("answer");
  expect(screen.getByText("Aucun compte enregistré.")).toBeVisible();
  expect(screen.queryByRole("list", { name: "Comptes enregistrés" })).not.toBeInTheDocument();
});

test("a greeting is answered without reading any data", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  await chat.ask("Bonjour !");

  expect(await screen.findByText(assistantGreeting)).toBeVisible();
  // No tool part: no account list, no user summary card, no sticker.
  const thread = within(screen.getByRole("region", { name: "Messages" }));
  expect(thread.queryByRole("list")).not.toBeInTheDocument();
  expect(thread.queryByRole("region")).not.toBeInTheDocument();
  expect(thread.queryByRole("link")).not.toBeInTheDocument();
});

test("an unreachable chat model is reported, and an empty message is not sent", async (context) => {
  const world = await fetchedWorld(context, { ollama: { chat: "unreachable" } });
  const chat = await mountChat(world);

  await chat.user.click(screen.getByRole("button", { name: "Envoyer" }));
  expect(world.ollama.requests.filter(({ kind }) => kind === "chat")).toStrictEqual([]);
  // Enter sends the message.
  await chat.user.type(screen.getByRole("textbox", { name: "Message" }), "Hello{Enter}");

  expect(await screen.findByRole("alert")).toHaveTextContent("Le modèle n’a pas répondu.");
});
