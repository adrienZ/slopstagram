import { afterEach, beforeEach, expect, test, vi, type TestContext } from "vitest";
import { screen, within } from "@testing-library/react";
import { Route } from "../../app/routes/chat.tsx";
import { loadChatPage } from "../../app/loaders/chat.ts";
import { handleChatRequest } from "../../app/routes/api/chat.ts";
import { createPageRenderer } from "../render-page.ts";
import {
  assistantGreeting,
  assistantThinking,
  createWorld,
  now,
  placeId,
} from "../setup/report-world.ts";

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
    world,
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
  expect(screen.getByRole("region", { name: "Messages" })).toHaveTextContent(
    "What did @user_072 post today?",
  );
  expect(screen.getByRole("button", { name: "Envoyer" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
  gate.resolve();

  const bold = await screen.findByText("answer");
  // The model writes markdown: the chat renders it instead of showing its marks.
  expect(bold.tagName).toBe("STRONG");
  expect(screen.getByText("getFeedUserSummaries")).toBeVisible();
  // The trace shows what the Assistant asked the tool.
  expect(screen.getByText('{"usernames":["user_072"]}')).toBeVisible();
  // Its mentions are the stickers of the story feed.
  const answerSticker = screen.getAllByRole("link", { name: "@user_072" }).at(-1);
  expect(answerSticker).toHaveAttribute("href", "/users/user_072");
  expect(answerSticker?.querySelector("img")).toHaveAttribute(
    "src",
    "/media/avatars/700000000000068.jpg",
  );
  // A mention of an account that is unknown stays plain text.
  expect(screen.getByText(/@user_999/u)).toBeVisible();
  expect(screen.queryByRole("link", { name: "@user_999" })).not.toBeInTheDocument();
  // What the Assistant read is kept behind its trace line.
  expect(screen.queryByText("Summary of user_072")).not.toBeInTheDocument();
  await chat.user.click(screen.getByRole("button", { name: /^getFeedUserSummaries\b/u }));
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
  await chat.user.click(screen.getByRole("button", { name: /^getFeedUserSummaries\b/u }));
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
  await chat.user.click(screen.getByRole("button", { name: /^listAccounts\b/u }));
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
  await chat.user.click(screen.getByRole("button", { name: /^listAccounts\b/u }));
  expect(screen.getByText("Aucun compte.")).toBeVisible();
});

test("searching an account traces the search, which lists the matches", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  await chat.ask("Search user_0");

  await screen.findByText("answer");
  await chat.user.click(screen.getByRole("button", { name: /^searchAccounts\b/u }));
  const items = within(screen.getByRole("list", { name: "Comptes trouvés" })).getAllByRole(
    "listitem",
  );
  expect(items.map((item) => item.textContent)).toStrictEqual(["@user_008", "@user_072"]);
});

test("a search without a match says no account was found", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  await chat.ask("Search nobody");

  await screen.findByText("answer");
  await chat.user.click(screen.getByRole("button", { name: /^searchAccounts\b/u }));
  expect(screen.getByText("Aucun compte trouvé.")).toBeVisible();
});

test("a place the Assistant names links to that place on the map", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  await chat.ask(`Lieu instagram:${placeId}`);

  const link = await screen.findByRole("link", { name: "Synthetic Cafe" });
  expect(link).toHaveAttribute("href", `/map?place=instagram%3A${placeId}`);
  expect(link).not.toHaveAttribute("target");
  // What the Assistant read is kept behind its trace line.
  expect(screen.queryByText("1 Synthetic Street")).not.toBeInTheDocument();
  await chat.user.click(screen.getByRole("button", { name: /^getTaggedPlace\b/u }));
  const read = within(screen.getByRole("region", { name: "Lieu lu" }));
  expect(read.getByText("Synthetic Cafe · Cafe")).toBeVisible();
  expect(read.getByText("1 Synthetic Street")).toBeVisible();
  expect(read.getByRole("listitem")).toHaveTextContent("29 oct. · @user_008");
});

test("asking for the places traces the read, which lists the places", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  await chat.ask("Quels lieux ?");

  // The places the Assistant read link to the map wherever its answer names them, even where
  // the model forgot the place link or linked elsewhere.
  const links = await screen.findAllByRole("link", { name: "Synthetic Cafe" });
  expect(links.map((link) => link.getAttribute("href"))).toStrictEqual([
    `/map?place=instagram%3A${placeId}`,
    `/map?place=instagram%3A${placeId}`,
  ]);
  expect(screen.getByText("{}")).toBeVisible();
  await chat.user.click(screen.getByRole("button", { name: /^listTaggedPlaces\b/u }));
  const items = within(screen.getByRole("list", { name: "Lieux" })).getAllByRole("listitem");
  // The read is plain text: no link.
  expect(items.map((item) => item.textContent)).toStrictEqual([
    "Synthetic Cafe · Cafe · 1 story · @user_008",
  ]);
  expect(within(items[0]).queryByRole("link")).not.toBeInTheDocument();
});

test("searching a place traces the search, which lists the matches or says there is none", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  await chat.ask("Cherche lieux cafe");
  await screen.findAllByRole("link", { name: "Synthetic Cafe" });
  await chat.user.click(screen.getByRole("button", { name: /^searchTaggedPlaces\b/u }));
  expect(
    within(screen.getByRole("list", { name: "Lieux trouvés" })).getByRole("listitem"),
  ).toHaveTextContent("Synthetic Cafe · Cafe · 1 story · @user_008");

  await chat.ask("Cherche lieux louvre");
  await vi.waitFor(() => {
    expect(screen.getAllByRole("button", { name: /^searchTaggedPlaces\b/u })).toHaveLength(2);
  });
  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Envoyer" })).toBeEnabled());
  const [, louvreSearch] = screen.getAllByRole("button", { name: /^searchTaggedPlaces\b/u });
  await chat.user.click(louvreSearch);
  expect(screen.getByText("Aucun lieu trouvé.")).toBeVisible();
});

test("a greeting is answered without reading any data", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  await chat.ask("Bonjour !");

  expect(await screen.findByText(assistantGreeting)).toBeVisible();
  // No tool part: no trace line and no sticker.
  const thread = within(screen.getByRole("region", { name: "Messages" }));
  expect(thread.queryByText(/^(?:get|list|search)\w+$/u)).not.toBeInTheDocument();
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

test("typing @ suggests the saved accounts, filtered as I type, and the keyboard picks one", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));
  const field = screen.getByRole("textbox", { name: "Message" });

  await chat.user.type(field, "What did @");
  const suggestions = screen.getByRole("listbox", { name: "Suggestions de mentions" });
  const options = within(suggestions).getAllByRole("option");
  expect(options.map((option) => option.textContent)).toStrictEqual(["@user_008", "@user_072"]);
  expect(options.map((option) => option.querySelector("img")?.getAttribute("src"))).toStrictEqual([
    "/media/avatars/700000000000001.jpg",
    "/media/avatars/700000000000068.jpg",
  ]);
  // The first suggestion is active, and the field points at it.
  expect(field).toHaveAttribute("aria-controls", suggestions.id);
  expect(field).toHaveAttribute("aria-activedescendant", options[0]?.id);
  expect(options[0]).toHaveAttribute("aria-selected", "true");

  await chat.user.type(field, "USER_07");
  expect(
    within(screen.getByRole("listbox", { name: "Suggestions de mentions" }))
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toStrictEqual(["@user_072"]);
  await chat.user.keyboard("{Backspace}{Backspace}");
  await chat.user.keyboard("{ArrowDown}");
  const active = screen.getByRole("option", { name: "@user_072" });
  expect(active).toHaveAttribute("aria-selected", "true");
  expect(field).toHaveAttribute("aria-activedescendant", active.id);

  // Enter picks the active suggestion instead of sending the message.
  await chat.user.keyboard("{Enter}");
  expect(field).toHaveValue("What did @user_072 ");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(field).not.toHaveAttribute("aria-activedescendant");
  expect(chat.world.ollama.requests.filter(({ kind }) => kind === "chat")).toStrictEqual([]);

  // Tab picks too, in the middle of the text, which stays after the inserted Mention.
  await chat.user.type(field, "and @user_0 post?");
  await chat.user.keyboard("{ArrowLeft>6/}");
  await chat.user.keyboard("{Tab}");
  expect(field).toHaveValue("What did @user_072 and @user_008 post?");
  expect(field).toHaveFocus();
  await chat.user.keyboard("all ");
  expect(field).toHaveValue("What did @user_072 and @user_008 all post?");
  await chat.user.keyboard("{End}");

  // Escape closes the suggestions and leaves the text as typed.
  await chat.user.type(field, "or @user");
  await chat.user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(field).toHaveValue("What did @user_072 and @user_008 all post?or @user");
});

test("clicking a suggestion inserts the mention, which the Assistant receives", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));
  const field = screen.getByRole("textbox", { name: "Message" });

  await chat.user.type(field, "Quoi de neuf chez @72");
  await chat.user.click(screen.getByRole("option", { name: "@user_072" }));
  expect(field).toHaveValue("Quoi de neuf chez @user_072 ");
  expect(field).toHaveFocus();
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

  await chat.user.type(field, "?{Enter}");

  // The message reached the Assistant as plain text, and its tool read the mentioned account.
  await screen.findByText("answer");
  expect(chat.world.ollama.requests.find(({ kind }) => kind === "chat")?.prompt).toBe(
    "Quoi de neuf chez @user_072 ?",
  );
  expect(screen.getByText("getFeedUserSummaries")).toBeVisible();
});

test("only the mentions of saved accounts are highlighted in the field", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));
  const field = screen.getByRole("textbox", { name: "Message" });

  await chat.user.type(field, "Compare @User_072, @user_404 and me@user_008.");

  expect(
    screen.getAllByText(/@/u, { selector: "mark" }).map((mark) => mark.textContent),
  ).toStrictEqual(["@User_072"]);
  // The highlight is painted behind the field, which keeps the exact text.
  const backdrop = screen.getByText("@User_072", { selector: "mark" }).parentElement;
  expect(backdrop).toHaveAttribute("aria-hidden", "true");
  expect(backdrop).toHaveTextContent("Compare @User_072, @user_404 and me@user_008.");
  expect(backdrop?.querySelector("img")).toBeNull();
});

test("a sent message shows the mentions of saved accounts as stickers", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  await chat.ask("Compare @user_072 with @user_404 ");

  await screen.findByText("answer");
  const sent = screen.getByText("Compare", { exact: false, selector: "p" });
  expect(sent).toHaveTextContent("Compare @user_072 with @user_404");
  const stickers = within(sent).getAllByRole("link");
  expect(stickers.map((sticker) => sticker.textContent)).toStrictEqual(["@user_072"]);
  expect(stickers[0]).toHaveAttribute("href", "/users/user_072");
  expect(stickers[0]?.querySelector("img")).toHaveAttribute(
    "src",
    "/media/avatars/700000000000068.jpg",
  );
});
