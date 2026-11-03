import { expect, test } from "vitest";
import { createChatResponse } from "../server/routes/api/chat.post.ts";
import { chatAnswer, fakeChatOllama } from "./chat-ollama.ts";
import { useSharedTestRuntime } from "./setup/test-runtime.ts";
import {
  namedAccount,
  outsideFeedAccount,
  pageNow,
  seedPageDatabase,
  userSummary,
} from "./ui/seeded-pages.ts";

const shared = useSharedTestRuntime(seedPageDatabase, { fetchOllama: fakeChatOllama });

function chatRequest(body: string) {
  return new globalThis.Request("http://localhost/api/chat", {
    body,
    method: "POST",
  });
}

async function ask(text: string) {
  const response = await createChatResponse(
    shared.runtime,
    chatRequest(
      JSON.stringify({ messages: [{ id: "1", parts: [{ text, type: "text" }], role: "user" }] }),
    ),
    pageNow,
  );
  return await response.text();
}

test("listing the accounts calls the tool and streams the answer back", async () => {
  const stream = await ask("Liste les comptes");
  expect(stream).toContain("listUsers");
  expect(stream).toContain(namedAccount.username);
  expect(stream).toContain(outsideFeedAccount);
  expect(stream).toContain(chatAnswer);
});

test("a mentioned account's summary of the last 24 hours reaches the tool result", async () => {
  const stream = await ask(`Que fait @${namedAccount.username.toUpperCase()} ?`);
  expect(stream).toContain("getRecentUserSummary");
  expect(stream).toContain(userSummary);
});

test("a mentioned account without stories in the last 24 hours has no summary", async () => {
  const stream = await ask(`Et @${outsideFeedAccount} ?`);
  expect(stream).toContain('"storyCount":0');
  expect(stream).not.toContain(userSummary);
});

test("an unknown mention is reported to the model", async () => {
  expect(await ask("Et @nobody ?")).toContain("compte inconnu");
});

test("a malformed request is rejected", async () => {
  const response = await createChatResponse(
    shared.runtime,
    chatRequest(JSON.stringify({ nope: true })),
  );
  expect(response.status).toBe(400);
});
