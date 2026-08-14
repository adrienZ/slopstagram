import assert from "node:assert/strict";
import { test } from "node:test";
import type { InstagramSession } from "../sdk/lib/playwright-service.ts";
import { createInstagramClient } from "../sdk/story-client-service.ts";

type ApiRequestCall = {
  headers?: Record<string, string>;
  url: string;
};

function createSession(body: unknown, calls: ApiRequestCall[] = []): InstagramSession {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Test double only needs page.evaluate for this adapter.
  return {
    context: {
      request: {
        get: (url: string, options?: { headers?: Record<string, string> }) => {
          calls.push({ headers: options?.headers, url });
          return Promise.resolve({
            headers: () => ({ "content-type": "application/json" }),
            json: () => Promise.resolve(body),
            ok: () => true,
            status: () => 200,
          });
        },
      },
    },
    page: {},
  } as unknown as InstagramSession;
}

test("createInstagramClient fetches tray through the browser request context", async () => {
  const calls: ApiRequestCall[] = [];
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
      headers: { "x-ig-app-id": "936619743392459" },
      url: "https://www.instagram.com/api/v1/feed/reels_tray/",
    },
  ]);
});

test("createInstagramClient fetches reels media through the browser request context", async () => {
  const calls: ApiRequestCall[] = [];
  const session = createSession({ reels: {}, status: "ok" }, calls);

  const response = await createInstagramClient(session).getReelsMedia(["reel 1", "reel/2"]);

  assert.equal(response.ok, true);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reels: {}, status: "ok" });
  assert.deepEqual(calls, [
    {
      headers: { "x-ig-app-id": "936619743392459" },
      url: "https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=reel%201&reel_ids=reel%2F2",
    },
  ]);
});
