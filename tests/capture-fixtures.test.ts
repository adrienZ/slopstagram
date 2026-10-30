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
  "Flore",
  "cafe-de-flore",
  "Boulevard Saint-Germain",
  "Paris",
  "75006",
  "+33 1 23 45 67 89",
  "48.85",
  "2.33",
  "real_artist_account",
  "real_sharer",
  "audio.cdninstagram.com",
];
// Public metadata of a licensed catalog track is kept as recorded.
const publicAudio = ["Synthetic Song", "Synthetic Artist", "777", "888000"];

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

function musicAssetInfo() {
  return {
    audio_asset_id: "777",
    audio_cluster_id: "888000",
    is_original_sound: false,
    title: "Synthetic Song",
    display_artist: "Synthetic Artist",
    duration_in_ms: 30_000,
    progressive_download_url: "https://audio.cdninstagram.com/track.m4a",
    cover_artwork_uri: "https://scontent.cdninstagram.com/v/cover.jpg",
    ig_artist: {
      id: "999",
      username: "real_artist_account",
      profile_pic_url: "https://scontent.cdninstagram.com/v/artist.jpg",
    },
  };
}

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
    story_locations: [
      {
        id: "sticker-location",
        location: {
          pk: "555",
          name: "Cafe de Flore",
          short_name: "Flore",
          lat: 48.85,
          lng: 2.33,
          address: "Boulevard Saint-Germain",
          city: "Paris",
        },
      },
    ],
    story_music_stickers: [{ id: "sticker-music", music_asset_info: musicAssetInfo() }],
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
                      short_name: "Flore",
                      location_id: "555",
                      location_address: "Boulevard Saint-Germain",
                      location_city: "Paris",
                      location_zip: "75006",
                      slug: "cafe-de-flore",
                      lat: 48.85,
                      lng: 2.33,
                      phone: "+33 1 23 45 67 89",
                    },
                  },
                },
              },
            }),
          );
        }
        return await Promise.resolve(
          body({
            metadata: { music_info: { music_asset_info: musicAssetInfo() } },
            shared_by: { pk: "real_sharer_pk", username: "real_sharer" },
          }),
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
  for (const kept of publicAudio) {
    expect(redacted).toContain(kept);
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

const syntheticPlace = {
  location_info: {
    name: "Synthetic Cafe",
    short_name: "Synth",
    location_id: "4242",
    location_address: "1 Synthetic Street",
    location_city: "Syntheticville",
    location_zip: "91919",
    slug: "synthetic-cafe",
    category: "Synthetic Category",
    lat: 12.3456,
    lng: -65.4321,
    latitude: 12.3456,
    longitude: -65.4321,
    facebook_places_id: 31_337,
    ig_business: { profile: { id: "5150", username: "synthetic_business" } },
  },
};

test("redaction replaces every place field, coordinates included, deterministically", () => {
  const first = createRedactor()(syntheticPlace);
  const second = createRedactor()(syntheticPlace);
  const text = JSON.stringify(first);

  expect(first).toStrictEqual(second);
  for (const original of [
    "Synthetic Cafe",
    "Synth",
    "4242",
    "1 Synthetic Street",
    "Syntheticville",
    "91919",
    "synthetic-cafe",
    "Synthetic Category",
    "12.3456",
    "65.4321",
    "31337",
    "5150",
    "synthetic_business",
  ]) {
    expect(text).not.toContain(original);
  }
  const info = z
    .object({ location_info: z.object({ lat: z.number(), lng: z.number(), slug: z.string() }) })
    .parse(first).location_info;
  expect(Math.abs(info.lat)).toBeLessThanOrEqual(90);
  expect(Math.abs(info.lng)).toBeLessThanOrEqual(180);
  expect(info.slug).toMatch(/^fixture-slug-\d+$/u);
});

test("a place gets the same replacement wherever it appears across payloads", () => {
  const redact = createRedactor();

  const placeFields = z.object({ id: z.string(), name: z.string(), lat: z.number() });

  const sticker = placeFields.parse(redact({ id: "4242", name: "Synthetic Cafe", lat: 12.3456 }));
  const lookup = placeFields.parse(redact({ id: "4242", name: "Synthetic Cafe", lat: 12.3456 }));

  expect(lookup).toStrictEqual(sticker);
  expect(sticker.id).not.toBe("4242");
  expect(sticker.name).not.toBe("Synthetic Cafe");
  expect(sticker.lat).not.toBe(12.3456);
});

test("public audio metadata is kept while the people around the track are replaced", () => {
  const redact = createRedactor();
  const sticker = { id: "sticker-1", music_asset_info: musicAssetInfo() };
  const asset = {
    metadata: { music_info: { music_asset_info: musicAssetInfo() } },
    shared_by: { username: "real_sharer" },
  };

  const redactedSticker = JSON.stringify(redact(sticker));
  const redactedAsset = JSON.stringify(redact(asset));

  for (const redacted of [redactedSticker, redactedAsset]) {
    for (const kept of ["Synthetic Song", "Synthetic Artist", '"audio_asset_id":"777"']) {
      expect(redacted).toContain(kept);
    }
    expect(redacted).toContain('"duration_in_ms":30000');
    expect(redacted).not.toContain("cdninstagram.com");
    expect(redacted).not.toContain("real_artist_account");
  }
  expect(redactedSticker).not.toContain("sticker-1");
  expect(redactedAsset).not.toContain("real_sharer");
});

test("a username nested inside a music payload is still replaced", () => {
  const redacted = JSON.stringify(
    createRedactor()({
      music_asset_info: {
        is_original_sound: false,
        title: "Synthetic Song",
        username: "real_nested_user",
        ig_artist: { username: "real_nested_artist", full_name: "Nested Person" },
      },
    }),
  );

  expect(redacted).toContain("Synthetic Song");
  for (const original of ["real_nested_user", "real_nested_artist", "Nested Person"]) {
    expect(redacted).not.toContain(original);
  }
});

function originalAudioInfo(extra: Record<string, JsonValue> = {}) {
  return {
    audio_asset_id: "4321",
    audio_cluster_id: "4321000",
    duration_in_ms: 12_000,
    title: "Original audio - creator_example",
    display_artist: "creator_example",
    ig_artist: { id: "55", username: "creator_example", full_name: "Creator Example" },
    ...extra,
  };
}

const creatorTexts = ["creator_example", "Creator Example", "Original audio"];

test("original audio replaces the creator name but keeps ids and durations", () => {
  const redacted = JSON.stringify(
    createRedactor()({ music_asset_info: originalAudioInfo({ is_original_sound: true }) }),
  );

  for (const original of creatorTexts) {
    expect(redacted).not.toContain(original);
  }
  expect(redacted).toContain('"audio_asset_id":"4321"');
  expect(redacted).toContain('"duration_in_ms":12000');
  expect(redacted).toContain("Fixture audio title");
  expect(redacted).toContain("Fixture audio artist");
});

test("audio is replaced when the original indicator is missing or ambiguous", () => {
  const cases = [
    originalAudioInfo(),
    originalAudioInfo({ is_original_sound: null }),
    originalAudioInfo({ is_original_sound: "false" }),
    originalAudioInfo({ is_original_sound: false, original_audio_title: "Original audio" }),
    originalAudioInfo({ is_original_sound: false, original_sound_info: { audio_asset_id: "1" } }),
    originalAudioInfo({ is_original_sound: false, is_original_audio: true }),
  ];

  for (const info of cases) {
    const redacted = JSON.stringify(createRedactor()({ music_asset_info: info }));
    for (const original of creatorTexts) {
      expect(redacted).not.toContain(original);
    }
  }
});

test("a licensed-looking track whose text names an account in the payload is replaced", () => {
  const redacted = JSON.stringify(
    createRedactor()({
      user: { username: "named_example_user" },
      music_asset_info: {
        is_original_sound: false,
        title: "Synthetic Song",
        display_artist: "Named_Example_User",
      },
    }),
  );

  expect(redacted).not.toContain("Named_Example_User");
  expect(redacted).not.toContain("named_example_user");
});

test("replaced audio text is deterministic and distinct per original", () => {
  const first = createRedactor();
  const second = createRedactor();
  const info = originalAudioInfo();
  const other = originalAudioInfo({
    title: "Another creator_two sound",
    display_artist: "creator_two",
  });

  const a = JSON.stringify(first({ music_asset_info: info }));
  const again = JSON.stringify(first({ music_asset_info: info }));
  const otherRedacted = JSON.stringify(first({ music_asset_info: other }));

  expect(again).toBe(a);
  expect(JSON.stringify(second({ music_asset_info: info }))).toBe(a);
  expect(otherRedacted).not.toBe(a);
  expect(otherRedacted).not.toContain("creator_two");
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
