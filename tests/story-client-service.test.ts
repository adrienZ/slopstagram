import assert from "node:assert/strict";
import { test } from "node:test";
import type { InstagramSession } from "../sdk/lib/playwright-service.ts";
import { createInstagramClient } from "../sdk/story-client-service.ts";

type BrowserFetchCall = {
  appId: string;
  requestUrl: string;
};

function createSession(
  body: unknown,
  calls: BrowserFetchCall[] = [],
  contentType = "application/json",
): InstagramSession {
  const serializedBody =
    body instanceof Error
      ? "<!DOCTYPE html>"
      : typeof body === "string"
        ? body
        : JSON.stringify(body);

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Test double only needs page.evaluate for this adapter.
  return {
    context: {},
    page: {
      evaluate: (_callback: unknown, input: BrowserFetchCall) => {
        calls.push(input);
        return Promise.resolve({
          body: serializedBody,
          headers: { "content-type": contentType },
          ok: true,
          status: 200,
        });
      },
    },
  } as unknown as InstagramSession;
}

test("createInstagramClient fetches tray through the authenticated browser page", async () => {
  const calls: BrowserFetchCall[] = [];
  const session = createSession(
    {
      broadcasts: [],
      status: "ok",
      story_ranking_token: "ranking-token",
      tray: [],
    },
    calls,
  );

  const response = await createInstagramClient(session).getTray();

  assert.equal(response.ok, true);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    broadcasts: [],
    status: "ok",
    story_ranking_token: "ranking-token",
    tray: [],
  });
  assert.deepEqual(calls, [
    {
      appId: "936619743392459",
      requestUrl: "https://www.instagram.com/api/v1/feed/reels_tray/",
    },
  ]);
});

test("normalizes numeric Instagram tray identifiers to strings", async () => {
  const session = createSession({
    broadcasts: [],
    status: "ok",
    story_ranking_token: "ranking-token",
    tray: [
      {
        id: 123,
        media_ids: [456, "789"],
        user: { pk: 321, username: "one" },
      },
    ],
  });

  const response = await createInstagramClient(session).getTray();

  assert.deepEqual((await response.json()).tray, [
    {
      id: "123",
      media_ids: ["456", "789"],
      user: { pk: "321", username: "one" },
    },
  ]);
});

test("preserves large numeric Instagram identifiers exactly", async () => {
  const session = createSession(`{
    "broadcasts": [],
    "status": "ok",
    "story_ranking_token": "ranking-token",
    "tray": [{
      "id": 1767198846,
      "media_ids": [3967029617634386001],
      "user": { "pk": 1767198846, "username": "one" }
    }]
  }`);

  const response = await createInstagramClient(session).getTray();

  assert.deepEqual((await response.json()).tray, [
    {
      id: "1767198846",
      media_ids: ["3967029617634386001"],
      user: { pk: "1767198846", username: "one" },
    },
  ]);
});

test("reports an expired browser session when Instagram returns HTML", async () => {
  const session = createSession(
    new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"),
    [],
    "text/html; charset=utf-8",
  );

  await assert.rejects(
    createInstagramClient(session)
      .getTray()
      .then((response) => response.json()),
    /run npm run auth/u,
  );
});

test("createInstagramClient fetches reels media through the authenticated browser page", async () => {
  const calls: BrowserFetchCall[] = [];
  const session = createSession({ reels: {}, status: "ok" }, calls);

  const response = await createInstagramClient(session).getReelsMedia(["reel 1", "reel/2"]);

  assert.equal(response.ok, true);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reels: {}, status: "ok" });
  assert.deepEqual(calls, [
    {
      appId: "936619743392459",
      requestUrl:
        "https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=reel%201&reel_ids=reel%2F2",
    },
  ]);
});
