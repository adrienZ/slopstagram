import assert from "node:assert/strict";
import { test } from "node:test";
import type { StoryOutputUser } from "../sdk/lib/types.ts";
import { createStoryCards } from "../server/story-card-view-model.ts";
import type { StoryCardSources } from "../server/story-card-view-model.ts";

function createUser(): StoryOutputUser {
  return {
    full_name: "Story User",
    username: "story-user",
    profile_pic_url: "avatar.jpg",
    reel_ids: [],
    stories: ["first", "missing", "empty", "blank", "last"].map((mediaPk) => ({
      media_pk: mediaPk,
      preview_image_url: `${mediaPk}.jpg`,
      media_type: "image",
      ig_caption: " caption ",
      locations: ["Paris", "Lyon"],
      stickers: ["link:A & B"],
      status: "ok",
    })),
  };
}

function createSources(): StoryCardSources {
  return {
    cachedImages: {
      profilePicPathByUrl: new Map([["avatar.jpg", "/media/avatar.jpg"]]),
      storyPreviewPathByUrl: new Map([
        ["first.jpg", "/media/first.jpg"],
        ["empty.jpg", ""],
        ["last.jpg", "/media/last.jpg"],
      ]),
    },
    appleCaptionByMediaPk: new Map([["first", " apple <text> "]]),
    visionByPreviewUrl: new Map([["first.jpg", { text: "OCR text", visual: "Vue de Paris" }]]),
  };
}

test("story cards exclude unavailable previews and preserve source order and user positions", () => {
  const user = createUser();
  user.stories[3].preview_image_url = " ";
  const cards = createStoryCards(user, createSources());

  assert.deepEqual(
    cards.map(({ mediaPk, position, count, preview }) => ({ mediaPk, position, count, preview })),
    [
      { mediaPk: "first", position: 1, count: 5, preview: "/media/first.jpg" },
      { mediaPk: "last", position: 5, count: 5, preview: "/media/last.jpg" },
    ],
  );
});

test("story cards supply complete lightbox details and normalize absent values", () => {
  const sources = createSources();
  const user = createUser();
  const [first] = createStoryCards(user, sources);
  assert.equal(first.userName, "Story User (story-user)");
  assert.equal(first.avatar, "/media/avatar.jpg");
  assert.equal(first.url, "https://www.instagram.com/stories/story-user/first/");
  assert.equal(first.mediaType, "Image");
  assert.equal(first.igCaption, "caption");
  assert.equal(first.appleCaption, "apple <text>");
  assert.equal(first.stickers, "link:A & B");
  assert.equal(first.locations, "Paris\nLyon");
  assert.equal(first.visionOcr, "OCR text");
  assert.equal(first.visionDescription, "Vue de Paris");

  user.profile_pic_url = null;
  user.stories[0].media_type = "video";
  user.stories[0].ig_caption = " ";
  user.stories[0].stickers = [];
  user.stories[0].locations = [];
  sources.appleCaptionByMediaPk.clear();
  sources.visionByPreviewUrl.clear();
  const [empty] = createStoryCards(user, sources);
  assert.equal(empty.avatar, undefined);
  assert.equal(empty.mediaType, "Vidéo");
  for (const key of [
    "igCaption",
    "stickers",
    "locations",
    "appleCaption",
    "visionOcr",
    "visionDescription",
  ] as const) {
    assert.equal(empty[key], "—");
  }
});
