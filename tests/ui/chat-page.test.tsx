import { afterEach, beforeEach, expect, test, vi, type TestContext } from "vitest";
import { screen, within } from "@testing-library/react";
import { Route } from "../../app/routes/chat.tsx";
import { loadChatPage } from "../../app/loaders/chat.ts";
import { handleChatRequest } from "../../app/routes/api/chat.ts";
import { createPageRenderer } from "../render-page.ts";
import { assistantThinking, createWorld, now } from "../setup/report-world.ts";

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

test("asking about an account renders its user summary card as the whole answer", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  const gate = chat.hold();
  await chat.ask("What did @user_072 post today?");
  // The thread shows the question and the send button waits for the answer.
  expect(screen.getByText("What did @user_072 post today?")).toBeVisible();
  expect(screen.getByRole("button", { name: "Envoyer" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
  gate.resolve();

  const card = within(await screen.findByRole("region", { name: "Résumé de @user_072" }));
  const sticker = card.getByRole("link", { name: "@user_072" });
  expect(sticker).toHaveAttribute("href", "/users/user_072");
  expect(sticker.querySelector("img")).toHaveAttribute("src", "/media/avatars/700000000000068.jpg");
  expect(card.getByText("2 stories dans les dernières 24 heures")).toBeVisible();
  expect(card.getByText("Summary of user_072")).toBeVisible();
  // The reasoning is available, collapsed.
  const reasoning = screen.getByRole("button", { name: "Raisonnement" });
  expect(reasoning).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText(assistantThinking)).not.toBeInTheDocument();
  await chat.user.click(reasoning);
  expect(screen.getByText(assistantThinking)).toBeVisible();
  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Envoyer" })).toBeEnabled());
  expect(screen.queryByText("answer")).not.toBeInTheDocument();
});

test("several accounts render the read and the written answer, without cards", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  await chat.ask("Are @user_072 and @user_999 together?");

  const answer = await screen.findByText("answer");
  // The model writes markdown: the chat renders it instead of showing its marks.
  expect(answer.tagName).toBe("STRONG");
  expect(answer.parentElement).toHaveTextContent("Synthetic answer from the tool result.");
  expect(screen.getByText("Lecture des résumés de @user_072, @user_999")).toBeVisible();
  expect(screen.queryByRole("region", { name: /^Résumé de/u })).not.toBeInTheDocument();
});

test("an unknown account renders the unknown outcome", async (context) => {
  const chat = await mountChat(await fetchedWorld(context));

  await chat.ask("And @user_999?");

  const card = within(await screen.findByRole("region", { name: "Résumé de @user_999" }));
  expect(card.getByText("Aucun compte enregistré ne s’appelle @user_999.")).toBeVisible();
  expect(card.queryByRole("link")).not.toBeInTheDocument();
});

test("an account without stories in the last 24 hours renders that outcome", async (context) => {
  const world = await fetchedWorld(context);
  vi.setSystemTime(new Date(now.getTime() + 24 * 3600 * 1000));
  const chat = await mountChat(world);

  await chat.ask("And @user_008?");

  const card = within(await screen.findByRole("region", { name: "Résumé de @user_008" }));
  expect(card.getByRole("link", { name: "@user_008" })).toBeVisible();
  expect(card.getByText("Aucune story publiée dans les dernières 24 heures.")).toBeVisible();
});

test("an account whose summary was not generated renders that outcome", async (context) => {
  const chat = await mountChat(
    await fetchedWorld(context, { ollama: { summary: "server-error" } }),
  );

  await chat.ask("And @user_072?");

  const card = within(await screen.findByRole("region", { name: "Résumé de @user_072" }));
  expect(
    card.getByText(
      "Le résumé n’est pas encore généré : il le sera au prochain relevé des stories.",
    ),
  ).toBeVisible();
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
