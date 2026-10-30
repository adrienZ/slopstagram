import { test, expect } from "vitest";
import type { StoryOutputUser } from "../sdk/report-types.ts";
import { createStoryCards, type StoryCardSources } from "../server/story-card-view-model.ts";

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

  expect(
    cards.map(({ mediaPk, position, count, preview }) => ({ mediaPk, position, count, preview })),
  ).toStrictEqual([
    { mediaPk: "first", position: 1, count: 5, preview: "/media/first.jpg" },
    { mediaPk: "last", position: 5, count: 5, preview: "/media/last.jpg" },
  ]);
});

test("story cards carry how their vision analysis is outdated", () => {
  const sources = createSources();
  const outdated = {
    currentModel: "new-model",
    currentPromptHash: "new-hash",
    model: "old-model",
    promptHash: "old-hash",
  };
  sources.outdatedVisionByPreviewUrl = new Map([["first.jpg", outdated]]);
  const [first, ...others] = createStoryCards(createUser(), sources);
  expect(first.visionOutdated).toStrictEqual(outdated);
  expect(others.every((card) => !("visionOutdated" in card))).toBe(true);
});

test("story cards supply complete lightbox details and normalize absent values", () => {
  const sources = createSources();
  const user = createUser();
  const [first] = createStoryCards(user, sources);
  expect(first.userName).toBe("Story User (@story-user)");
  expect(first.avatar).toBe("/media/avatar.jpg");
  expect(first.url).toBe("https://www.instagram.com/stories/story-user/first/");
  expect(first.mediaType).toBe("Image");
  expect(first.igCaption).toBe("caption");
  expect(first.appleCaption).toBe("apple <text>");
  expect(first.stickers).toBe("link:A & B");
  expect(first.locations).toBe("Paris\nLyon");
  expect(first.visionOcr).toBe("OCR text");
  expect(first.visionDescription).toBe("Vue de Paris");

  user.profile_pic_url = null;
  user.stories[0].media_type = "video";
  user.stories[0].ig_caption = " ";
  user.stories[0].stickers = [];
  user.stories[0].locations = [];
  sources.appleCaptionByMediaPk.clear();
  sources.visionByPreviewUrl.clear();
  const [empty] = createStoryCards(user, sources);
  expect(empty.avatar).toBe(undefined);
  expect(empty.mediaType).toBe("Vidéo");
  for (const key of [
    "igCaption",
    "stickers",
    "locations",
    "appleCaption",
    "visionOcr",
    "visionDescription",
  ] as const) {
    expect(empty[key]).toBe("—");
  }
});
