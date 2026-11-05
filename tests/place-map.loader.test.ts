import { expect, test } from "vitest";
import { loadPlaceMap } from "../app/loaders/place-map.ts";
import { useSharedTestRuntime } from "./setup/test-runtime.ts";
import { mapAccounts, seedMapDatabase, sharedPlace, soloPlace } from "./ui/seeded-pages.ts";

const shared = useSharedTestRuntime(seedMapDatabase);
const [ada, ben, cleo] = mapAccounts;

test("returns one place per tagged place across accounts, its latest story first", () => {
  const { places } = loadPlaceMap(shared.runtime);

  expect(
    places.map(({ name, latitude, longitude, stories }) => ({
      name,
      latitude,
      longitude,
      stories: stories.map(({ mediaPk, username }) => [mediaPk, username]),
    })),
  ).toStrictEqual([
    {
      name: sharedPlace.name,
      latitude: 48.8,
      longitude: 12.5,
      stories: [
        [sharedPlace.latestPk, cleo],
        [sharedPlace.oldestPk, ada],
      ],
    },
    {
      name: soloPlace.name,
      latitude: 45.1,
      longitude: 5.7,
      stories: [[soloPlace.pk, ben]],
    },
  ]);
});

test("lists only the accounts with a mapped place, with their avatar", () => {
  const { accounts } = loadPlaceMap(shared.runtime);

  expect(accounts).toStrictEqual([
    { username: ada, avatarPath: "/media/avatars/700000000000001.jpg" },
    { username: ben, avatarPath: "/media/avatars/700000000000062.jpg" },
    { username: cleo, avatarPath: "/media/avatars/700000000000068.jpg" },
  ]);
});

test("returns a story card for every story of a mapped place", () => {
  const { stories } = loadPlaceMap(shared.runtime);

  expect(new Map(stories.map(({ mediaPk, username }) => [mediaPk, username]))).toStrictEqual(
    new Map([
      [sharedPlace.latestPk, cleo],
      [sharedPlace.oldestPk, ada],
      [soloPlace.pk, ben],
    ]),
  );
});
