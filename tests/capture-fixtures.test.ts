import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { z } from "zod";
import {
  buildFixtureMetadata,
  captureInstagramPayloads,
  createRedactor,
  redactPayloads,
} from "../scripts/capture-fixtures.ts";
import type { JsonValue } from "../sdk/lib/json-value.ts";
import { createInstagramClient } from "../sdk/story-client-service.ts";

type Session = Parameters<typeof createInstagramClient>[0];

const secrets = [
  "real_alice",
  "real_bob",
  "real_carol",
  "real_dave",
  "Alice Real",
  "Dave Private",
  "3967029617634386001",
  "1767198846",
  "private caption",
  "scontent.cdninstagram.com",
  "Cafe de Flore",
  "Boulevard Saint-Germain",
  "+33 1 23 45 67 89",
  "Secret Song",
];

function trayEntry(userPk: string, username: string, fullName: string, mediaId: string) {
  return {
    id: userPk,
    media_ids: [mediaId],
    user: { pk: userPk, id: userPk, username, full_name: fullName },
  };
}

const liveTray = {
  broadcasts: [{ id: "live" }],
  story_ranking_token: "token-private",
  status: "ok",
  tray: [
    trayEntry("1767198846", "real_alice", "Alice Real", "3967029617634386001"),
    trayEntry("2", "real_bob", "Bob", "20"),
    trayEntry("3", "real_carol", "Carol", "30"),
    trayEntry("4", "real_dave", "Dave Private", "40"),
  ],
};

function liveStory(entry: ReturnType<typeof trayEntry>) {
  return {
    pk: entry.media_ids[0],
    id: `${entry.media_ids[0]}_${entry.id}`,
    media_type: 1,
    taken_at: 1_790_000_000,
    caption: { text: "private caption" },
    user: { pk: entry.id, username: entry.user.username },
    image_versions2: {
      candidates: [{ url: "https://scontent.cdninstagram.com/v/a.jpg", width: 1080, height: 1920 }],
    },
    story_locations: [{ location: { pk: "555", name: "Cafe de Flore", lat: 48.85, lng: 2.33 } }],
    story_music_stickers: [{ music_asset_info: { audio_asset_id: "777", title: "Secret Song" } }],
  };
}

function body(value: JsonValue, status = 200) {
  return {
    body: JSON.stringify(value),
    headers: { "content-type": "application/json" },
    ok: status === 200,
    status,
  };
}

function liveSession(): Session {
  const reels = liveTray.tray.map((entry) => ({
    id: entry.id,
    user: entry.user,
    items: [liveStory(entry)],
  }));
  return {
    page: {
      evaluate: async (_pageFunction, input) => {
        if (input.requestUrl.endsWith("/reels_tray/")) {
          return await Promise.resolve(body(liveTray));
        }
        if (input.mediaQuery !== undefined) {
          const { reelIds } = input.mediaQuery;
          return await Promise.resolve(
            body({
              data: {
                xdt_api__v1__feed__reels_media__connection: {
                  edges: reels.filter(({ id }) => reelIds.includes(id)).map((node) => ({ node })),
                  page_info: { has_next_page: false, end_cursor: null },
                },
              },
            }),
          );
        }
        if (input.placeQuery !== undefined) {
          return await Promise.resolve(
            body({
              data: {
                xdt_location_get_web_info: {
                  native_location_data: {
                    location_info: {
                      name: "Cafe de Flore",
                      location_id: "555",
                      location_address: "Boulevard Saint-Germain",
                      lat: 48.85,
                      lng: 2.33,
                      ig_business: { phone: "+33 1 23 45 67 89" },
                    },
                  },
                },
              },
            }),
          );
        }
        return await Promise.resolve(
          body({ items: [{ audio_asset_id: "777", title: "Secret Song" }] }),
        );
      },
    },
  };
}

test("capture keeps only the first reels of the tray, one place and one music asset", async () => {
  const captured = await captureInstagramPayloads(liveSession());

  expect(JSON.stringify(captured.tray)).not.toContain("real_dave");
  expect(JSON.stringify(captured.tray)).toContain("real_carol");
  expect(captured.galleryPages).toHaveLength(1);
  expect(captured.place).not.toBeNull();
  expect(captured.musicAsset).not.toBeNull();
});

test("redacted captures contain no original name, identifier, URL, text, place or music", async () => {
  const redacted = JSON.stringify(redactPayloads(await captureInstagramPayloads(liveSession())));

  for (const secret of secrets) {
    expect(redacted).not.toContain(secret);
  }
  expect(redacted).toContain('"media_type":1');
  expect(redacted).toContain('"width":1080');
});

test("redacted captures still parse with the production client, and tray and gallery agree", async () => {
  const { tray, galleryPages } = redactPayloads(await captureInstagramPayloads(liveSession()));
  const recorded: Session = {
    page: {
      evaluate: async (_pageFunction, input) =>
        await Promise.resolve({
          body: JSON.stringify(input.mediaQuery === undefined ? tray : galleryPages[0]),
          headers: { "content-type": "application/json" },
          ok: true,
          status: 200,
        }),
    },
  };
  const client = createInstagramClient(recorded);

  const trayResponse = await client.getTray();
  const { tray: entries } = trayResponse.json();
  const reelsResponse = await client.getReelsMedia(entries.map(({ id }) => id));
  const { reels_media: reels } = reelsResponse.json();

  expect(entries).toHaveLength(3);
  expect(reels.map((reel) => reel.items?.map(({ pk }) => pk))).toEqual(
    entries.map(({ media_ids: mediaIds }) => mediaIds),
  );
});

test("redaction gives the same original the same replacement across payloads", () => {
  const redact = createRedactor();

  const first = JSON.stringify(redact({ pk: "42", user: { username: "someone" } }));
  const second = JSON.stringify(redact({ id: "42", username: "someone" }));

  expect(first).not.toContain("42");
  expect(/user_\d+/u.exec(first)?.[0]).toBe(/user_\d+/u.exec(second)?.[0]);
  expect(/7000\d+/u.exec(first)?.[0]).toBe(/7000\d+/u.exec(second)?.[0]);
});

test("fixture metadata states the capture date and what each file covers", async () => {
  const redacted = redactPayloads(await captureInstagramPayloads(liveSession()));

  const { metadata, files } = buildFixtureMetadata(redacted, new Date("2026-10-29T10:00:00Z"));

  expect(metadata.capturedAt).toBe("2026-10-29T10:00:00.000Z");
  expect(metadata.files.map(({ name }) => name)).toEqual(files.map(([name]) => name));
  expect(metadata.files.map(({ name }) => name)).toEqual([
    "instagram-reels-tray.json",
    "instagram-story-data.json",
    "instagram-place.json",
    "instagram-music-asset.json",
  ]);
  for (const { covers } of metadata.files) {
    expect(covers.length).toBeGreaterThan(0);
  }
});

test("fixture metadata omits the place and music files when they were not captured", () => {
  const { metadata } = buildFixtureMetadata(
    { tray: {}, galleryPages: [{}, {}], place: null, musicAsset: null },
    new Date("2026-10-29T10:00:00Z"),
  );

  expect(metadata.files.map(({ name }) => name)).toEqual([
    "instagram-reels-tray.json",
    "instagram-story-data.json",
    "instagram-story-data-2.json",
  ]);
});

test("redaction replaces a string that is not known to be structural, whatever its key", () => {
  const redact = createRedactor();

  const redacted = JSON.stringify(
    redact({ unknown_field: "surprise value", status: "ok", nested: [{ label: "Another one" }] }),
  );

  expect(redacted).not.toContain("surprise value");
  expect(redacted).not.toContain("Another one");
  expect(redacted).toContain('"status":"ok"');
});

test("the capture command is on demand only and never reads the local cache", async () => {
  const packageJson = z
    .object({ scripts: z.record(z.string(), z.string()) })
    .parse(JSON.parse(await readFile("package.json", "utf-8")));
  const script = await readFile("scripts/capture-fixtures.ts", "utf-8");
  const imports = script.match(/from "[^"]+"/gu) ?? [];

  expect(packageJson.scripts["fixtures:capture"]).toBe("tsx scripts/capture-fixtures.ts");
  for (const name of ["check", "check:ci", "test", "test:reporter", "postinstall", "prepare"]) {
    expect(packageJson.scripts[name]).not.toContain("fixtures:capture");
    expect(packageJson.scripts[name]).not.toContain("capture-fixtures");
  }
  expect(script).not.toContain("data/cache");
  expect(imports.join("\n")).not.toMatch(/cache|storage|media-service|database|repositor/u);
});
