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
  // A mention of an account that is unknown stays plain text.
  expect(screen.getByText(/@user_999/u)).toBeVisible();
  expect(screen.queryByRole("link", { name: "@user_999" })).not.toBeInTheDocument();
  // What the Assistant read is kept behind its trace line.
  expect(screen.queryByText("Summary of user_072")).not.toBeInTheDocument();
  await chat.user.click(screen.getByRole("button", { name: "Lecture du résumé de @user_072" }));
  const read = within(screen.getByRole("list", { name: "Résumés lus" }));
  expect(read.getByText("2 stories dans les dernières 24 heures")).toBeVisible();
  expect(read.getByText("Summary of user_072")).toBeVisible();
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
  await chat.user.click(
    screen.getByRole("button", { name: "Lecture des résumés de @user_072, @user_999" }),
  );
  const read = within(screen.getByRole("list", { name: "Résumés lus" }));
  expect(read.getByText("Summary of user_072")).toBeVisible();
  expect(read.getByText("Aucun compte ne s’appelle @user_999.")).toBeVisible();
});

test("asking which accounts there are traces the read, which lists the accounts", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  await chat.ask("Quels comptes connais-tu ?");

  const bold = await screen.findByText("answer");
  expect(bold.tagName).toBe("STRONG");
  expect(screen.queryByRole("list", { name: "Comptes" })).not.toBeInTheDocument();
  await chat.user.click(screen.getByRole("button", { name: "Lecture des comptes" }));
  const items = within(screen.getByRole("list", { name: "Comptes" })).getAllByRole("listitem");
  // The read is plain text: no sticker, link or avatar.
  expect(items[0]).toHaveTextContent("@user_008");
  expect(items[1]).toHaveTextContent("@user_072");
  expect(within(items[0]).queryByRole("link")).not.toBeInTheDocument();
});

test("asking which accounts there are before any fetch run says there is none", async (context) => {
  const chat = await mountChat(await createWorld(context));

  await chat.ask("Which accounts do you know?");

  await screen.findByText("answer");
  await chat.user.click(screen.getByRole("button", { name: "Lecture des comptes" }));
  expect(screen.getByText("Aucun compte.")).toBeVisible();
});

test("searching an account traces the search, which lists the matches", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  await chat.ask("Search user_0");

  await screen.findByText("answer");
  await chat.user.click(screen.getByRole("button", { name: "Recherche de « user_0 »" }));
  const items = within(screen.getByRole("list", { name: "Comptes trouvés" })).getAllByRole(
    "listitem",
  );
  expect(items.map((item) => item.textContent)).toStrictEqual(["@user_008", "@user_072"]);
});

test("a search without a match says no account was found", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  await chat.ask("Search nobody");

  await screen.findByText("answer");
  await chat.user.click(screen.getByRole("button", { name: "Recherche de « nobody »" }));
  expect(screen.getByText("Aucun compte trouvé.")).toBeVisible();
});

test("a greeting is answered without reading any data", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  await chat.ask("Bonjour !");

  expect(await screen.findByText(assistantGreeting)).toBeVisible();
  // No tool part: no trace line and no sticker.
  const thread = within(screen.getByRole("region", { name: "Messages" }));
  expect(thread.queryByText(/^Lecture /u)).not.toBeInTheDocument();
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
