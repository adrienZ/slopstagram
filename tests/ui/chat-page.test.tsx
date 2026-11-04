import { afterEach, beforeEach, expect, test, vi, type TestContext } from "vitest";
import { screen, within } from "@testing-library/react";
import { Route } from "../../app/routes/chat.tsx";
import { loadChatPage } from "../../app/loaders/chat.ts";
import { handleChatRequest } from "../../app/routes/api/chat.ts";
import { createPageRenderer } from "../render-page.ts";
import {
  assistantAnswer,
  assistantGreeting,
  assistantThinking,
  createWorld,
  now,
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

test("asking about an account renders its user summary card, then the answer", async (context) => {
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

  const answer = await screen.findByText(assistantAnswer);
  const card = within(screen.getByRole("region", { name: "Résumé de @user_072" }));
  const sticker = card.getByRole("link", { name: "@user_072" });
  expect(sticker).toHaveAttribute("href", "/users/user_072");
  expect(sticker.querySelector("img")).toHaveAttribute("src", "/media/avatars/700000000000068.jpg");
  expect(card.getByText("2 stories dans les dernières 24 heures")).toBeVisible();
  expect(card.getByText("Summary of user_072")).toBeVisible();
  expect(
    screen.getByRole("region", { name: "Résumé de @user_072" }).compareDocumentPosition(answer),
  ).toBe(globalThis.Node.DOCUMENT_POSITION_FOLLOWING);
  // The reasoning is available, collapsed.
  const reasoning = screen.getByRole("button", { name: "Raisonnement" });
  expect(reasoning).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText(assistantThinking)).not.toBeInTheDocument();
  await chat.user.click(reasoning);
  expect(screen.getByText(assistantThinking)).toBeVisible();
  expect(screen.getByRole("button", { name: "Envoyer" })).toBeEnabled();
});

test("an unknown account renders the unknown outcome", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  await chat.ask("And @user_999?");

  await screen.findByText(assistantAnswer);
  const card = within(screen.getByRole("region", { name: "Résumé de @user_999" }));
  expect(card.getByText("Aucun compte enregistré ne s’appelle @user_999.")).toBeVisible();
  expect(card.queryByRole("link")).not.toBeInTheDocument();
});

test("an account without stories in the last 24 hours renders that outcome", async (context) => {
  const world = await fetchedWorld(context);
  vi.setSystemTime(new Date(now.getTime() + 24 * 3600 * 1000));
  const chat = await mountChat(world);

  await chat.ask("And @user_008?");

  await screen.findByText(assistantAnswer);
  const card = within(screen.getByRole("region", { name: "Résumé de @user_008" }));
  expect(card.getByRole("link", { name: "@user_008" })).toBeVisible();
  expect(card.getByText("Aucune story publiée dans les dernières 24 heures.")).toBeVisible();
});

test("an account whose summary was not generated renders that outcome", async (context) => {
  const chat = await mountChat(
    await fetchedWorld(context, { ollama: { summary: "server-error" } }),
  );

  await chat.ask("And @user_072?");

  await screen.findByText(assistantAnswer);
  const card = within(screen.getByRole("region", { name: "Résumé de @user_072" }));
  expect(
    card.getByText(
      "Le résumé n’est pas encore généré : il le sera au prochain relevé des stories.",
    ),
  ).toBeVisible();
});

test("asking which accounts are saved renders every saved account as a mention sticker", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  await chat.ask("Quels comptes connais-tu ?");

  const answer = await screen.findByText(assistantAnswer);
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

  await screen.findByText(assistantAnswer);
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
  await screen.findByText(assistantAnswer);
  expect(chat.world.ollama.requests.find(({ kind }) => kind === "chat")?.prompt).toBe(
    "Quoi de neuf chez @user_072 ?",
  );
  expect(screen.getByRole("region", { name: "Résumé de @user_072" })).toBeVisible();
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

  await screen.findByText(assistantAnswer);
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
