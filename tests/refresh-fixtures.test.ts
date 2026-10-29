import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { createRedactor, selectReels, toGalleryPayload } from "../scripts/refresh-fixtures.ts";
import type { JsonValue } from "../sdk/lib/json-value.ts";
import { StoryReelSchema } from "../sdk/lib/story-schemas.ts";

const directories: Array<string> = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

function story(pk: string, userPk: string, extra: Record<string, JsonValue> = {}) {
  return {
    pk,
    id: `${pk}_${userPk}`,
    media_type: 1,
    taken_at: 1_790_000_000,
    caption: { text: "private caption" },
    accessibility_caption: "private description",
    video_dash_manifest: "<MPD>https://cdn.example.net/secret.mp4</MPD>",
    user: { pk: userPk, username: `name_of_${userPk}`, full_name: "Real Person" },
    image_versions2: {
      candidates: [
        { url: "https://scontent.cdninstagram.com/v/real.jpg", width: 1080, height: 1920 },
      ],
    },
    story_locations: [{ location: { name: "Real Cafe", lat: 48.8584, lng: 2.2945, pk: "12345" } }],
    story_bloks_stickers: [
      {
        bloks_sticker: {
          sticker_data: { ig_mention: { username: "friend", full_name: "A Friend" } },
        },
      },
    ],
    ...extra,
  };
}

function userPkOf(json: string): string | undefined {
  return /"user":\{"pk":"(?<pk>\d+)"/u.exec(json)?.groups?.pk;
}

test("redaction replaces identifiers, names, URLs, text and coordinates but keeps structure", () => {
  const redact = createRedactor();

  const redacted = JSON.stringify(redact(story("3967029617634386001", "1767198846")));

  for (const secret of [
    "3967029617634386001",
    "1767198846",
    "name_of_1767198846",
    "Real Person",
    "private caption",
    "private description",
    "secret.mp4",
    "cdninstagram.com",
    "Real Cafe",
    "friend",
    "48.8584",
    "2.2945",
  ]) {
    expect(redacted).not.toContain(secret);
  }
  expect(redacted).toContain('"media_type":1');
  expect(redacted).toContain('"taken_at":1790000000');
  expect(redacted).toContain('"width":1080');
});

test("redaction maps the same original to the same replacement, across stories", () => {
  const redact = createRedactor();

  const first = JSON.stringify(redact(story("100", "7")));
  const second = JSON.stringify(redact(story("200", "7")));

  expect(userPkOf(first)).toBeDefined();
  expect(userPkOf(second)).toBe(userPkOf(first));
  expect(first).not.toBe(second);
});

test("selection builds reels from the users with the most cached stories, and they parse in production", async () => {
  const cache = await mkdtemp(path.join(tmpdir(), "slopstagram-refresh-"));
  directories.push(cache);
  await mkdir(path.join(cache, "stories"));
  const items = [
    story("1", "10"),
    story("2", "10", { story_music_stickers: [{ id: "music" }] }),
    story("3", "10"),
    story("4", "20"),
    story("5", "30"),
  ];
  await Promise.all(
    items.map(async (item) => {
      await writeFile(path.join(cache, "stories", `${item.pk}.json`), JSON.stringify(item));
    }),
  );
  await writeFile(path.join(cache, "stories", "notes.txt"), "not a story");

  const reels = await selectReels(cache);

  expect(reels.map(({ id }) => id)).toEqual(["10", "20"]);
  const redacted = reels.map((reel) => createRedactor()(reel));
  for (const reel of redacted) {
    expect(StoryReelSchema.safeParse(reel).success).toBe(true);
  }
  expect(toGalleryPayload(redacted)).toMatchObject({
    data: { xdt_api__v1__feed__reels_media__connection: { page_info: { has_next_page: false } } },
  });
});
