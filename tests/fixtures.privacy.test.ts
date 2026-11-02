import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, test } from "vitest";
import { createRedactor, findUnsafeFixtureValues } from "../scripts/capture-fixtures.ts";
import { JsonValueSchema } from "../sdk/lib/json-value.ts";
import type { JsonValue } from "../sdk/lib/json-value.ts";

const fixturesDirectory = fileURLToPath(new URL("fixtures", import.meta.url));
const MEDIA_EXTENSIONS = new Set([".m4a", ".mp4"]);
// MP4 atoms that hold titles, artists, comments, dates, GPS positions or copyright notices.
const PERSONAL_MEDIA_TAGS = ["©nam", "©ART", "©alb", "©cmt", "©day", "©xyz"];

const fixtureNames = await readdir(fixturesDirectory);
// Capture metadata describes the files (names, dates, what they cover); it holds no payload.
const METADATA_FILE_NAME = "capture-metadata.json";
const jsonNames = fixtureNames.filter(
  (name) => name.endsWith(".json") && name !== METADATA_FILE_NAME,
);
const mediaNames = fixtureNames.filter((name) => MEDIA_EXTENSIONS.has(path.extname(name)));

function describeUnsafe(payload: JsonValue): Array<string> {
  return findUnsafeFixtureValues(payload).map(
    ({ path: valuePath, reason }) => `${valuePath}: ${reason}`,
  );
}

describe("committed fixtures hold no personal data", () => {
  test("the guard scans something", () => {
    expect(jsonNames).toContain("instagram-story-data.json");
    expect(mediaNames.length).toBeGreaterThan(0);
  });

  test("every committed file is a JSON payload or a known media clip", () => {
    const unknown = fixtureNames.filter(
      (name) =>
        name !== METADATA_FILE_NAME && !jsonNames.includes(name) && !mediaNames.includes(name),
    );

    expect(unknown).toStrictEqual([]);
  });

  test.each(jsonNames)("%s has only structural, synthetic or public audio values", async (name) => {
    const payload = JsonValueSchema.parse(
      JSON.parse(await readFile(path.join(fixturesDirectory, name), "utf-8")),
    );

    // Offending values are never printed, only where they sit and why they were refused.
    expect(describeUnsafe(payload)).toStrictEqual([]);
  });

  test.each(mediaNames)("%s carries no personal metadata tags", async (name) => {
    const file = await readFile(path.join(fixturesDirectory, name));
    const bytes = file.toString("latin1");

    const found = PERSONAL_MEDIA_TAGS.filter((tag) => bytes.includes(tag));

    expect(found).toStrictEqual([]);
  });
});

describe("the fixture privacy guard", () => {
  // Deliberately unsafe, made-up input: nothing here is real, it only has the wrong shape.
  const unsafe = {
    caption: "A private caption",
    edges: [
      {
        node: {
          id: "123456789012345",
          location: { lat: 12.3456, name: "Unsafe Cafe" },
          user: { full_name: "Unsafe Person", pk: "98765", username: "unsafe_name" },
          profile_pic_url: "https://scontent.cdn-unsafe.net/avatar.jpg?token=unsafe",
        },
      },
    ],
    "123456789": { status: "ok" },
    music_asset_info: { display_artist: "Unsafe Person", is_original_sound: true, title: "Mine" },
  };

  test("fails on every value that is not structural, synthetic or public audio", () => {
    expect(describeUnsafe(unsafe).toSorted()).toStrictEqual(
      [
        "$.caption: free text that fixtures must omit",
        "$.edges[0].node.id: identifier is not synthetic",
        "$.edges[0].node.location.lat: latitude is not a synthetic coordinate",
        "$.edges[0].node.location.name: text is not synthetic",
        "$.edges[0].node.user.full_name: text is not synthetic",
        "$.edges[0].node.user.pk: identifier is not synthetic",
        "$.edges[0].node.user.username: username is not synthetic",
        "$.edges[0].node.profile_pic_url: text is not synthetic",
        "$.123456789: object key is an identifier that is not synthetic",
        "$.music_asset_info.display_artist: audio text of a track that is not a licensed catalog track",
        "$.music_asset_info.title: audio text of a track that is not a licensed catalog track",
      ].toSorted(),
    );
  });

  test("never repeats the offending values in its report", () => {
    const report = JSON.stringify(findUnsafeFixtureValues(unsafe));

    for (const value of ["private caption", "Unsafe", "unsafe_name", "123456789012345", "token"]) {
      expect(report).not.toContain(value);
    }
  });

  test("accepts public metadata of a licensed catalog track", () => {
    const licensed = {
      music_asset_info: {
        audio_asset_id: "1088211046447259",
        display_artist: "Public Artist",
        duration_in_ms: 30_000,
        is_original_sound: false,
        title: "Public Title",
      },
    };

    expect(describeUnsafe(licensed)).toStrictEqual([]);
  });

  test("refuses audio text that names a person of the same payload", () => {
    const namesTheCreator = {
      owner: { username: "creator_handle" },
      music_asset_info: {
        display_artist: "creator_handle",
        is_original_sound: false,
        title: "Public Title",
      },
    };

    expect(describeUnsafe(namesTheCreator)).toContain(
      "$.music_asset_info.display_artist: audio text of a track that is not a licensed catalog track",
    );
  });

  test("accepts explicit hand-written synthetic values", () => {
    const handWritten = {
      full_name: "Fixture user 1",
      quoted_name: 'Fixture "user" 2',
      ig_caption: "Fixture caption 1",
      locations: ["Fixture place 1"],
      media_pk: "fixture-pk-1",
      preview_image_url: "images/story-previews/fixture-pk-1.jpg",
      stickers: ["link:Fixture link 1"],
      url: "https://cdn.example.test/fixture-image-1.jpg",
      username: "fixture_user_1",
    };

    expect(describeUnsafe(handWritten)).toStrictEqual([]);
  });

  test("accepts everything the redactor writes, so the two share one set of rules", () => {
    const made: JsonValue = {
      data: {
        reels: [
          {
            caption: { text: "anything" },
            id: "55555555555",
            items: [
              {
                accessibility_caption: "anything",
                code: "Abc123",
                location: { lat: 51.5074, lng: -0.1278, name: "Made Up Place", slug: "made-up" },
                music_asset_info: {
                  audio_asset_id: "1088211046447259",
                  display_artist: "Mixed Handle",
                  is_original_sound: true,
                  title: "Mixed Title",
                },
                pk: "66666666666",
                profile_pic_url: "https://scontent.cdn-unsafe.net/a.jpg",
                taken_at: 1_790_000_000,
                user: { full_name: "Made Up", username: "made_up_handle" },
              },
            ],
            product_type: "story",
          },
        ],
      },
    };
    expect(findUnsafeFixtureValues(made).length).toBeGreaterThan(0);

    const redacted = createRedactor()(made);

    expect(describeUnsafe(redacted)).toStrictEqual([]);
  });
});
