import { expect, test, type TestContext } from "vitest";
import { z } from "zod";
import { createDrizzle } from "../../sdk/database/client.ts";
import { type JsonValue, JsonValueSchema } from "../../sdk/lib/json-value.ts";
import { InstagramUserRepository } from "../../sdk/repositories/instagram-user-repository.ts";
import { StoryRepository, storyRepository } from "../../sdk/repositories/story-repository.ts";
import { readRecordedPayloads, seedRecordedStories } from "./seed.ts";

const now = new Date("2026-10-29T12:00:00.000Z");
const HOUR = 3600;
const imageStoryPk = "700000000000271";
const storyPks = [imageStoryPk, "700000000000292", "700000000000314"];

const GalleryPageSchema = z.looseObject({
  data: z.looseObject({
    xdt_api__v1__feed__reels_media__connection: z.looseObject({
      edges: z.array(z.looseObject({ node: z.looseObject({ items: z.array(z.looseObject({})) }) })),
    }),
  }),
});

/** A fresh copy of the recorded gallery page, typed enough to edit what a test needs. */
async function recordedGalleryPage() {
  const { galleryPages } = await readRecordedPayloads(["instagram-story-data.json"]);
  return GalleryPageSchema.parse(galleryPages[0]);
}

function toPayload(page: z.infer<typeof GalleryPageSchema>): JsonValue {
  return JsonValueSchema.parse(page);
}

function createDatabase(context: TestContext) {
  const database = createDrizzle(":memory:");
  context.onTestFinished(() => {
    database.$client.close();
  });
  return {
    database,
    stories: new StoryRepository(database),
    users: new InstagramUserRepository(database),
  };
}

test("seeding stores the recorded stories, users, stickers and previews like a fetch run", async (context) => {
  const { database, stories, users } = createDatabase(context);

  const report = await seedRecordedStories(undefined, { database });

  expect(report.metadata.counts).toMatchObject({ failed: 0, fetched: 3, reels: 2, stories: 3 });
  expect(users.listAll().map(({ username }) => username)).toEqual(["user_019", "user_041"]);
  const image = stories.findByMediaPk(imageStoryPk);
  expect(image?.media_type).toBe(1);
  expect(image?.image_versions2?.candidates?.[0]?.url).toBeTypeOf("string");
  expect(image?.annotations?.stickers.length).toBeGreaterThan(0);
  expect(stories.listStickerKinds().length).toBeGreaterThan(0);
  expect(stories.findByMediaPk("700000000000292")?.media_type).toBe(2);
  expect(stories.findByMediaPk("700000000000314")?.annotations?.musicObservations).not.toEqual([]);
});

test("seeding a chosen set of recorded payloads stores only that set", async (context) => {
  const { database, stories } = createDatabase(context);
  const galleryPage = await recordedGalleryPage();
  galleryPage.data.xdt_api__v1__feed__reels_media__connection.edges.pop();

  await seedRecordedStories({ galleryPages: [toPayload(galleryPage)] }, { database });

  expect(stories.findByMediaPk(imageStoryPk)).not.toBeNull();
  expect(stories.findByMediaPk("700000000000292")).toBeNull();
});

test("seeding stores the reels of every recorded gallery page", async (context) => {
  const { database, stories } = createDatabase(context);
  const pages = await Promise.all([recordedGalleryPage(), recordedGalleryPage()]);
  const [pageOne, pageTwo] = pages.map((page, index) => {
    const connection = page.data.xdt_api__v1__feed__reels_media__connection;
    connection.edges = [connection.edges[index]];
    return toPayload(page);
  });

  await seedRecordedStories({ galleryPages: [pageOne, pageTwo] }, { database });

  expect(stories.findByMediaPk(imageStoryPk)).not.toBeNull();
  expect(stories.findByMediaPk("700000000000292")).not.toBeNull();
});

test("seeding fails loudly when a recording no longer matches the validation schemas", async (context) => {
  const { database, stories } = createDatabase(context);
  const drifted = await recordedGalleryPage();
  const [firstItem] = drifted.data.xdt_api__v1__feed__reels_media__connection.edges[0].node.items;
  firstItem.taken_at = "yesterday";

  await expect(
    seedRecordedStories({ galleryPages: [toPayload(drifted)] }, { database }),
  ).rejects.toThrow(/taken_at/u);
  expect(stories.findByMediaPk(imageStoryPk)).toBeNull();
});

test("seeding fails when a named recording does not exist", async () => {
  await expect(readRecordedPayloads(["instagram-missing.json"])).rejects.toThrow(
    "instagram-missing.json",
  );
  await expect(readRecordedPayloads(["audio-clip.m4a"])).rejects.toThrow(
    "No recorded reels media payload selected",
  );
});

test("seeded stories can be shifted in time to be active", async (context) => {
  const { database, stories } = createDatabase(context);

  await seedRecordedStories(undefined, { database, publishedBefore: { now, seconds: HOUR } });

  const active = stories.listActive(now);
  expect(active.map(({ story }) => story.pk).toSorted()).toEqual(storyPks);
  const newest = Math.max(...active.map(({ taken_at: takenAt }) => takenAt));
  expect(newest).toBe(now.getTime() / 1000 - HOUR);
});

test("seeded stories can be shifted in time to be past", async (context) => {
  const { database, stories } = createDatabase(context);

  await seedRecordedStories(undefined, { database, publishedBefore: { now, seconds: 26 * HOUR } });

  expect(stories.listActive(now)).toEqual([]);
  const yesterday = stories.listPublishedBetween(
    new Date(now.getTime() - 48 * 3_600_000),
    new Date(now.getTime() - 24 * 3_600_000),
  );
  expect(yesterday).toHaveLength(3);
});

function gaps(repository: StoryRepository): Array<number> {
  const times = storyPks.map((pk) => repository.findByMediaPk(pk)?.taken_at ?? 0);
  return times.map((time) => time - times[0]);
}

test("shifting keeps the gaps between recorded stories", async (context) => {
  const unshifted = createDatabase(context);
  const shifted = createDatabase(context);

  await seedRecordedStories(undefined, { database: unshifted.database });
  await seedRecordedStories(undefined, {
    database: shifted.database,
    publishedBefore: { now, seconds: HOUR },
  });

  expect(gaps(shifted.stories)).toEqual(gaps(unshifted.stories));
});

test("seeding without a database fills the application database that the repositories read", async () => {
  await seedRecordedStories(undefined, { publishedBefore: { now, seconds: HOUR } });

  expect(storyRepository.findByMediaPk(imageStoryPk)).not.toBeNull();
  expect(storyRepository.listActive(now)).toHaveLength(3);
});
