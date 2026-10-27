import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";
import type { JsonValue } from "../sdk/lib/json-value.ts";
import { createInstagramClient } from "../sdk/story-client-service.ts";

interface BrowserFetchCall {
  appId: string;
  requestUrl: string;
  mediaQuery?: { documentId: string; reelIds: Array<string>; after?: string };
  musicAssetId?: string;
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
    {
      data: {
        xdt_api__v1__feed__reels_media__connection: {
          edges: [{ node: { id: "reel 1", items: [] } }],
          page_info: { has_next_page: false, end_cursor: null },
        },
      },
    },
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
      mediaQuery: { documentId: "29306733562261201", reelIds: ["reel 1", "reel/2"] },
    },
  ]);
});

test("preserves large numeric media identifiers in GraphQL responses", async () => {
  const session = createSession(`{
    "data": { "xdt_api__v1__feed__reels_media__connection": { "edges": [{ "node": {
      "id": 123,
      "items": [{ "pk": 3967029617634386001, "taken_at": 1790000000 }]
    } }], "page_info": { "has_next_page": false, "end_cursor": null } } }
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
      data: {
        xdt_api__v1__feed__reels_media__connection: {
          edges: [],
          page_info: { has_next_page: false, end_cursor: null },
        },
      },
      errors: [{ message: "Partial failure" }],
    },
    {},
  ];
  for (const body of failureBodies) {
    const session = createSession(body);
    // oxlint-disable-next-line no-await-in-loop -- Verify each distinct HTTP-success failure payload.
    await assert.rejects(
      createInstagramClient(session).getReelsMedia(["123"]),
      /Instagram story media query failed/u,
    );
  }
});

test("reads all gallery pages without dropping reels", async () => {
  const calls: Array<BrowserFetchCall> = [];
  const pages = [
    {
      data: {
        xdt_api__v1__feed__reels_media__connection: {
          edges: [{ node: { id: "r1", items: [{ pk: "story1" }] } }],
          page_info: { has_next_page: true, end_cursor: "cursor-1" },
        },
      },
    },
    {
      data: {
        xdt_api__v1__feed__reels_media__connection: {
          edges: [{ node: { id: "r2", items: [{ pk: "story2" }] } }],
          page_info: { has_next_page: false, end_cursor: "cursor-2" },
        },
      },
    },
  ];
  const session: Parameters<typeof createInstagramClient>[0] = {
    page: {
      evaluate: async (_callback, input) => {
        calls.push(input);
        return {
          body: JSON.stringify(pages.shift()),
          headers: { "content-type": "application/json" },
          ok: true,
          status: 200,
        };
      },
    },
  };
  const response = await createInstagramClient(session).getReelsMedia(["r1", "r2"]);
  assert.deepEqual(response.json(), {
    reels_media: [
      { id: "r1", items: [{ pk: "story1" }] },
      { id: "r2", items: [{ pk: "story2" }] },
    ],
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].mediaQuery?.after, undefined);
  assert.equal(calls[1].mediaQuery?.after, "cursor-1");
});

test("rejects a gallery response whose pagination cannot advance", async () => {
  const body = {
    data: {
      xdt_api__v1__feed__reels_media__connection: {
        edges: [],
        page_info: { has_next_page: true, end_cursor: null },
      },
    },
  };
  await assert.rejects(
    createInstagramClient(createSession(body)).getReelsMedia(["r1"]),
    /pagination/u,
  );
});
