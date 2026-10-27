import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";
import type { JsonValue } from "../sdk/lib/json-value.ts";
import { createInstagramClient } from "../sdk/story-client-service.ts";

interface BrowserFetchCall {
  appId: string;
  requestUrl: string;
  mediaQuery?: { documentId: string; reelIds: Array<string> };
  musicAssetId?: string;
  placeQuery?: { documentId: string; placeId: string };
}

function createSession(
  body: Error | JsonValue,
  calls: Array<BrowserFetchCall> = [],
  contentType = "application/json",
): Parameters<typeof createInstagramClient>[0] {
  const rawBody = z.string().safeParse(body);
  let serializedBody: string;
  if (body instanceof Error) {
    serializedBody = "<!DOCTYPE html>";
  } else if (rawBody.success) {
    serializedBody = rawBody.data;
  } else {
    serializedBody = JSON.stringify(body);
  }

  return {
    page: {
      evaluate: async (_callback, input) => {
        calls.push(input);
        return {
          body: serializedBody,
          headers: { "content-type": contentType },
          ok: true,
          status: 200,
        };
      },
    },
  };
}

test("createInstagramClient fetches tray through the authenticated browser page", async () => {
  const calls: Array<BrowserFetchCall> = [];
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
  assert.deepEqual(response.json(), {
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

test("music lookup uses the authenticated session and preserves large numeric audio IDs", async () => {
  const calls: Array<BrowserFetchCall> = [];
  const client = createInstagramClient(
    createSession(
      '{"metadata":{"music_info":{"music_asset_info":{"audio_asset_id":10882110464472591}}}}',
      calls,
    ),
  );
  const { getMusicAsset } = client;
  assert.notEqual(getMusicAsset, undefined);
  if (getMusicAsset === undefined) {
    throw new Error("Music asset lookup unavailable");
  }
  const result = await getMusicAsset("10882110464472591");
  assert.deepEqual(result.json(), {
    metadata: { music_info: { music_asset_info: { audio_asset_id: "10882110464472591" } } },
  });
  assert.deepEqual(calls, [
    {
      appId: "936619743392459",
      requestUrl: "https://www.instagram.com/api/v1/clips/music/",
      musicAssetId: "10882110464472591",
    },
  ]);
});

test("looks up a place with the location container query from the authenticated page", async () => {
  const calls: Array<BrowserFetchCall> = [];
  const body = { data: { xdt_location_get_web_info: { native_location_data: null } } };
  const { getPlace } = createInstagramClient(
    createSession(body, calls, "text/javascript; charset=utf-8"),
  );
  assert.notEqual(getPlace, undefined);
  if (getPlace === undefined) {
    throw new Error("Place lookup unavailable");
  }
  const result = await getPlace("633725939834688");
  assert.deepEqual(result.json(), body);
  assert.deepEqual(calls, [
    {
      appId: "936619743392459",
      requestUrl: "https://www.instagram.com/api/graphql",
      placeQuery: { documentId: "28572807415659320", placeId: "633725939834688" },
    },
  ]);
});

test("rejects an HTML place lookup response", async () => {
  const { getPlace } = createInstagramClient(
    createSession("<!DOCTYPE html><html></html>", [], "text/html; charset=utf-8"),
  );
  if (getPlace === undefined) {
    throw new Error("Place lookup unavailable");
  }
  const result = await getPlace("633725939834688");
  assert.throws(() => result.json(), /text\/html/u);
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
  const body = response.json();

  assert.deepEqual(body.tray, [
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
  const body = response.json();

  assert.deepEqual(body.tray, [
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

test("createInstagramClient fetches reels media with the web viewer GraphQL query", async () => {
  const calls: Array<BrowserFetchCall> = [];
  const session = createSession(
    { data: { xdt_api__v1__feed__reels_media: { reels_media: [{ id: "reel 1", items: [] }] } } },
    calls,
  );

  const response = await createInstagramClient(session).getReelsMedia(["reel 1", "reel/2"]);

  assert.equal(response.ok, true);
  assert.equal(response.status, 200);
  assert.deepEqual(response.json(), { reels_media: [{ id: "reel 1", items: [] }] });
  assert.deepEqual(calls, [
    {
      appId: "936619743392459",
      requestUrl: "https://www.instagram.com/graphql/query",
      mediaQuery: { documentId: "28449850404637481", reelIds: ["reel 1", "reel/2"] },
    },
  ]);
});

test("preserves large numeric media identifiers in GraphQL responses", async () => {
  const session = createSession(`{
    "data": { "xdt_api__v1__feed__reels_media": { "reels_media": [{
      "id": 123,
      "items": [{ "pk": 3967029617634386001, "taken_at": 1790000000 }]
    }] } }
  }`);

  const response = await createInstagramClient(session).getReelsMedia(["123"]);
  assert.deepEqual(response.json(), {
    reels_media: [{ id: "123", items: [{ pk: "3967029617634386001", taken_at: 1_790_000_000 }] }],
  });
});

test("rejects GraphQL errors returned with HTTP 200 instead of accepting empty media", async () => {
  const failureBodies: Array<JsonValue> = [
    { data: null, errors: [{ message: "Media query unavailable" }] },
    {
      data: { xdt_api__v1__feed__reels_media: { reels_media: [] } },
      errors: [{ message: "Partial failure" }],
    },
    {},
  ];
  for (const body of failureBodies) {
    const session = createSession(body);
    // oxlint-disable-next-line no-await-in-loop -- Verify each distinct HTTP-success failure payload.
    const response = await createInstagramClient(session).getReelsMedia(["123"]);
    assert.throws(() => response.json(), /Instagram story media query failed/u);
  }
});
