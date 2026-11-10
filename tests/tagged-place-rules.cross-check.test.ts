import { expect, test } from "vitest";
import { loadPlaceMap } from "../app/loaders/place-map.ts";
import {
  getTaggedPlace,
  listTaggedPlaces,
  searchTaggedPlaces,
} from "@@/core/domains/places/tagged-places.ts";
import { pageNow } from "./ui/seeded-pages.ts";
import { editRecordedStories, readRecordedPayloads, seedRecordedStories } from "./setup/seed.ts";
import { useSharedTestRuntime } from "./setup/test-runtime.ts";

const withInstagramId = { name: "Fixture place with id", lat: 48.8, lng: 12.5 };
const withoutInstagramId = { name: "Fixture place without id", lat: 45.1, lng: 5.7 };
const SEARCH_TEXT = "fixture place";

/**
 * Seeds the recorded stories through production ingestion with two tagged places: one with an
 * Instagram place id and one Instagram gave none, which is then identified by its stored
 * location. The recordings hold neither.
 */
const shared = useSharedTestRuntime(async (runtime) => {
  const recorded = await readRecordedPayloads(["instagram-story-data.json"]);
  const pks: Array<string> = [];
  editRecordedStories(recorded, (story) => {
    pks.push(story.pk);
  });
  const [first, second] = pks;
  await seedRecordedStories(
    runtime,
    editRecordedStories(recorded, (story) => {
      if (story.pk === first) {
        story.story_locations = [
          {
            id: "700000000000921",
            location: { pk: "700000000000931", ...withInstagramId },
          },
        ];
      }
      if (story.pk === second) {
        story.story_locations = [
          { id: "700000000000922", location: { ...withoutInstagramId } },
          {
            id: "700000000000923",
            location: { pk: "700000000000951", name: "Fixture place without position" },
          },
        ];
      }
    }),
    { publishedBefore: { now: pageNow, seconds: 3600 } },
  );
});

function assistantPlaces() {
  const { runtime } = shared;
  const listed = listTaggedPlaces(runtime).places;
  const found = listed.map(({ id }) => getTaggedPlace(runtime, id));
  const searched = searchTaggedPlaces(runtime, { query: SEARCH_TEXT }).places;
  return { listed, found, searched };
}

function byName(places: Array<{ id: string; name: string }>) {
  return places
    .map(({ id, name }) => ({ id, name }))
    .toSorted((left, right) => left.id.localeCompare(right.id));
}

test("the Assistant's place reads and the map name the same places by the same ids and names", () => {
  const mapped = byName(loadPlaceMap(shared.runtime).places);
  const { listed, found, searched } = assistantPlaces();

  expect(mapped.map(({ name }) => name)).toEqual(
    expect.arrayContaining([withInstagramId.name, withoutInstagramId.name]),
  );
  expect(byName(listed)).toStrictEqual(mapped);
  expect(byName(searched)).toStrictEqual(mapped);
  expect(
    byName(found.flatMap((read) => (read.status === "found" ? [read.place] : []))),
  ).toStrictEqual(mapped);
});

test("a place with an Instagram place id and one without are identified differently", () => {
  const ids = new Map(loadPlaceMap(shared.runtime).places.map(({ id, name }) => [name, id]));

  expect(ids.get(withInstagramId.name)).toBe("instagram:700000000000931");
  expect(ids.get(withoutInstagramId.name)).toMatch(/^metadata:/u);
});
