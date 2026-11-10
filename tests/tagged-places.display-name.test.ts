import { expect, test } from "vitest";
import { InstagramUserRepository } from "@@/core/domains/database/repositories/instagram-user-repository.ts";
import { StoryRepository } from "@@/core/domains/database/repositories/story-repository.ts";
import { listTaggedPlaces } from "@@/core/domains/places/tagged-places.ts";
import { createTestDatabase } from "./test-database.ts";

const owner = { id: "u1", pk: "u1", username: "one", full_name: "One" };

// The recordings only hold named places: these cases are inserted through the real repositories.
test("a place with neither a name nor an address is summarized as an unnamed place", async (context) => {
  const database = createTestDatabase(context);
  const users = new InstagramUserRepository(database);
  const stories = new StoryRepository(database);
  await users.save(owner);
  await stories.save(
    {
      pk: "m1",
      taken_at: 1_767_225_600,
      story_locations: [{ id: "s1", location: { pk: "place-1", lat: 48, lng: 2 } }],
    },
    owner,
  );

  const { places } = listTaggedPlaces({ stories, users });

  expect(places.map(({ id, name }) => ({ id, name }))).toStrictEqual([
    { id: "instagram:place-1", name: "Lieu sans nom" },
  ]);
});

test("a place without a name is summarized by its address", async (context) => {
  const database = createTestDatabase(context);
  const users = new InstagramUserRepository(database);
  const stories = new StoryRepository(database);
  await users.save(owner);
  await stories.save(
    {
      pk: "m1",
      taken_at: 1_767_225_600,
      story_locations: [
        { id: "s1", location: { pk: "place-1", address: "1 Synthetic Street", lat: 48, lng: 2 } },
      ],
    },
    owner,
  );

  const { places } = listTaggedPlaces({ stories, users });

  expect(places.map(({ name }) => name)).toStrictEqual(["1 Synthetic Street"]);
});
